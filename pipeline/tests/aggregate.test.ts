import { describe, expect, it } from 'vitest'
import { aggregateEmployers, attachCbsa, median } from '../lib/aggregate'
import type { LcaRecord } from '../lib/parse-lca'

const rec = (employer: string, annualWage: number, soc = '15-1252', zip = '78701'): LcaRecord =>
  ({ soc, employer, zip, annualWage, caseNumber: '' })

describe('median', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })
  it('throws on empty input', () => {
    expect(() => median([])).toThrow()
  })
})

describe('attachCbsa', () => {
  it('joins on ZIP and reports the match rate', () => {
    const xwalk = new Map([['78701', '12420']])
    const { matched, matchRate } = attachCbsa([rec('A', 100000), rec('B', 100000, '15-1252', '00000')], xwalk)
    expect(matched).toEqual([{ ...rec('A', 100000), cbsa: '12420' }])
    expect(matchRate).toBe(0.5)
  })
  it('reports matchRate 0 (not 1) for empty input — an empty join is failed, not perfect', () => {
    const { matched, matchRate } = attachCbsa([], new Map([['78701', '12420']]))
    expect(matched).toEqual([])
    expect(matchRate).toBe(0)
  })
})

describe('aggregateEmployers', () => {
  it('groups by cbsa+soc, merging employer names case-insensitively, ranking by filings', () => {
    const rows = [
      rec('Acme Corp', 150000), rec('ACME CORP', 160000), rec('Acme Corp', 170000),
      rec('Beta LLC', 200000),
    ].map(r => ({ ...r, cbsa: '12420' }))
    const bundle = aggregateEmployers(rows).get('12420')!.get('15-1252')!
    expect(bundle.employers[0]).toEqual({ name: 'Acme Corp', filings: 3, median: 160000 })
    expect(bundle.employers[1]).toEqual({ name: 'Beta LLC', filings: 1, median: 200000 })
    expect(bundle.sample).toEqual([150000, 160000, 170000, 200000]) // sorted
    expect(bundle.n).toBe(4)
    expect(bundle.p99).toBe(200000) // n=4: ceil(0.99*4)-1 = 3 -> last element
  })
  it('merges punctuation/whitespace variants of one employer without stripping legal suffixes', () => {
    const rows = [
      rec('Acme Corp.', 150000), rec('ACME, CORP', 160000), rec('Acme   Corp', 170000),
      rec('Acme Inc', 180000), // different legal suffix -> NOT merged with "Acme Corp"
    ].map(r => ({ ...r, cbsa: '12420' }))
    const bundle = aggregateEmployers(rows).get('12420')!.get('15-1252')!
    const acmeCorp = bundle.employers.find(e => e.name.toUpperCase().includes('CORP'))!
    const acmeInc = bundle.employers.find(e => e.name.toUpperCase().includes('INC'))!
    expect(acmeCorp.filings).toBe(3)
    expect(acmeInc.filings).toBe(1)
  })
  it('caps employers at topN and samples wages deterministically at sampleMax', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ ...rec(`E${i % 20}`, 100000 + i * 100), cbsa: '12420' }))
    const bundle = aggregateEmployers(rows, { topN: 15, sampleMax: 200 }).get('12420')!.get('15-1252')!
    expect(bundle.employers).toHaveLength(15)
    expect(bundle.sample.length).toBeLessThanOrEqual(200)
    const again = aggregateEmployers(rows, { topN: 15, sampleMax: 200 }).get('12420')!.get('15-1252')!
    expect(again.sample).toEqual(bundle.sample) // deterministic
  })
  it('appends the true max wage to the sample when every-kth sampling would otherwise miss it', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ ...rec(`E${i % 20}`, 100000 + i * 100), cbsa: '12420' }))
    const bundle = aggregateEmployers(rows, { topN: 15, sampleMax: 200 }).get('12420')!.get('15-1252')!
    const trueMax = Math.max(...rows.map(r => r.annualWage))
    expect(bundle.sample.at(-1)).toBe(trueMax)
  })
  it('produces identical output regardless of input order (no O(n^2) accumulation quirks)', () => {
    const rows = [
      rec('Acme Corp', 150000), rec('ACME CORP', 160000), rec('Acme Corp', 170000),
      rec('Beta LLC', 200000), rec('Gamma Inc', 130000),
    ].map(r => ({ ...r, cbsa: '12420' }))
    const forward = aggregateEmployers(rows).get('12420')!.get('15-1252')!
    const reversed = aggregateEmployers([...rows].reverse()).get('12420')!.get('15-1252')!
    expect(reversed).toEqual(forward)
  })
  it('uses default topN/sampleMax when opts is omitted or partial', () => {
    const rows = [rec('Acme Corp', 150000)].map(r => ({ ...r, cbsa: '12420' }))
    expect(() => aggregateEmployers(rows)).not.toThrow()
    expect(() => aggregateEmployers(rows, {})).not.toThrow()
    expect(() => aggregateEmployers(rows, { topN: 5 })).not.toThrow()
  })
  it('computes p99 as the nearest-rank 99th percentile of the full wage list, not the sample', () => {
    // 100 wages 100000..109900 step 100, plus one $2M data-entry artifact (the true max).
    const rows = Array.from({ length: 100 }, (_, i) => rec(`E${i}`, 100000 + i * 100))
      .concat([rec('Outlier LLC', 2_000_000)])
      .map(r => ({ ...r, cbsa: '12420' }))
    const bundle = aggregateEmployers(rows).get('12420')!.get('15-1252')!
    expect(bundle.n).toBe(101)
    // sorted index: ceil(0.99*101)-1 = 99 -> the 100th smallest value (100000 + 99*100 = 109900),
    // one below the $2M outlier at index 100.
    const sorted = rows.map(r => r.annualWage).sort((a, b) => a - b)
    expect(bundle.p99).toBe(sorted[99])
    expect(bundle.p99).toBeLessThan(bundle.sample.at(-1)!) // sample still carries the true max
  })
})
