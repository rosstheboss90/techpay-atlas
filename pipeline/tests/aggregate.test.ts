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
  it('groups by cbsa+soc, merging employer names case-insensitively, ranking by count', () => {
    const rows = [
      rec('Acme Corp', 150000), rec('ACME CORP', 160000), rec('Acme Corp', 170000),
      rec('Beta LLC', 200000),
    ].map(r => ({ ...r, cbsa: '12420' }))
    const bundle = aggregateEmployers(rows).get('12420')!.get('15-1252')!
    expect(bundle.employers[0]).toEqual({ name: 'Acme Corp', count: 3, median: 160000 })
    expect(bundle.employers[1]).toEqual({ name: 'Beta LLC', count: 1, median: 200000 })
    expect(bundle.sample).toEqual([150000, 160000, 170000, 200000]) // sorted
  })
  it('caps employers at topN and samples wages deterministically at sampleMax', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ ...rec(`E${i % 20}`, 100000 + i * 100), cbsa: '12420' }))
    const bundle = aggregateEmployers(rows, { topN: 15, sampleMax: 200 }).get('12420')!.get('15-1252')!
    expect(bundle.employers).toHaveLength(15)
    expect(bundle.sample.length).toBeLessThanOrEqual(200)
    const again = aggregateEmployers(rows, { topN: 15, sampleMax: 200 }).get('12420')!.get('15-1252')!
    expect(again.sample).toEqual(bundle.sample) // deterministic
  })
})
