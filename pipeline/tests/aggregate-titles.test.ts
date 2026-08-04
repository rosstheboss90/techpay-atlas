import { describe, expect, it } from 'vitest'
import { aggregateTitles } from '../lib/aggregate-titles'
import type { LocatedLca } from '../lib/aggregate'

// --- tpm bucket: 10 records, exercising national stats, metro gating (A/B/C),
// tier gating (senior/base/staffPlus/lead), socMix (5 distinct socs -> top4+other),
// and topEmployers (7 distinct employers incl. a case-insensitive merge -> top5).
const tpm: LocatedLca[] = [
  { caseNumber: 'T0', soc: '15-1299', targetSoc: '15-1299', title: 'SENIOR TECHNICAL PROGRAM MANAGER II', employer: 'Acme Corp', zip: '00000', annualWage: 100_000, cbsa: 'A' },
  { caseNumber: 'T1', soc: '15-1299', targetSoc: '15-1299', title: 'TECHNICAL PROGRAM MANAGER', employer: 'ACME CORP', zip: '00000', annualWage: 200_000, cbsa: 'A' },
  { caseNumber: 'T2', soc: '15-1299', targetSoc: '15-1299', title: 'SENIOR TECHNICAL PROGRAM MANAGER', employer: 'Acme Corp', zip: '00000', annualWage: 300_000, cbsa: 'A' },
  { caseNumber: 'T3', soc: '15-1211', targetSoc: '15-1211', title: 'STAFF TECHNICAL PROGRAM MANAGER', employer: 'Beta LLC', zip: '00000', annualWage: 400_000, cbsa: 'B' },
  { caseNumber: 'T4', soc: '15-1211', targetSoc: '15-1211', title: 'SENIOR TECHNICAL PROGRAM MANAGER', employer: 'Beta LLC', zip: '00000', annualWage: 500_000, cbsa: 'A' },
  { caseNumber: 'T5', soc: '13-1111', targetSoc: '13-1111', title: 'TECHNICAL PROGRAM MANAGER III', employer: 'Gamma Inc', zip: '00000', annualWage: 600_000, cbsa: 'B' },
  { caseNumber: 'T6', soc: '13-1111', targetSoc: '13-1111', title: 'TECHNICAL PROGRAM MANAGER', employer: 'Delta Co', zip: '00000', annualWage: 700_000, cbsa: 'A' },
  { caseNumber: 'T7', soc: '11-9021', targetSoc: null, title: 'TECHNICAL PROGRAM MANAGER', employer: 'Epsilon Ltd', zip: '00000', annualWage: 800_000, cbsa: 'A' },
  { caseNumber: 'T8', soc: '11-9021', targetSoc: null, title: 'PRINCIPAL TECHNICAL PROGRAM MANAGER', employer: 'Zeta Corp', zip: '00000', annualWage: 900_000, cbsa: 'B' },
  { caseNumber: 'T9', soc: '17-2071', targetSoc: null, title: 'LEAD TECHNICAL PROGRAM MANAGER', employer: 'Eta Corp', zip: '00000', annualWage: 1_000_000, cbsa: 'C' },
]

// --- devops bucket: 3 records, distinct family, proves buckets are independent.
const devops: LocatedLca[] = [
  { caseNumber: 'D0', soc: '15-1252', targetSoc: '15-1252', title: 'DEVOPS ENGINEER', employer: 'Foo Inc', zip: '00000', annualWage: 150_000, cbsa: 'A' },
  { caseNumber: 'D1', soc: '15-1252', targetSoc: '15-1252', title: 'SENIOR DEVOPS ENGINEER', employer: 'Foo Inc', zip: '00000', annualWage: 250_000, cbsa: 'A' },
  { caseNumber: 'D2', soc: '15-1252', targetSoc: '15-1252', title: 'DEV OPS ENGINEER', employer: 'Bar LLC', zip: '00000', annualWage: 350_000, cbsa: 'A' },
]

// --- non-matching titles: must contribute nothing to any bucket.
const nonMatching: LocatedLca[] = [
  { caseNumber: 'N0', soc: '15-1252', targetSoc: '15-1252', title: 'SOFTWARE ENGINEER', employer: 'Nomatch Inc', zip: '00000', annualWage: 9_999_999, cbsa: 'A' },
  { caseNumber: 'N1', soc: '11-2021', targetSoc: '11-2021', title: 'MARKETING MANAGER', employer: 'Nomatch Inc', zip: '00000', annualWage: 1, cbsa: 'B' },
]

const allRecords = [...tpm, ...devops, ...nonMatching]

const findFamily = (out: ReturnType<typeof aggregateTitles>, key: string) =>
  out.families.find(f => f.key === key)!
const findBucket = (out: ReturnType<typeof aggregateTitles>, familyKey: string, bucketKey: string) =>
  findFamily(out, familyKey).buckets.find(b => b.key === bucketKey)!

describe('aggregateTitles', () => {
  it('computes national stats via nearest-rank p25/median/p75', () => {
    const out = aggregateTitles(allRecords, { metroMin: 2, tierMin: 2 })
    const tpmAgg = findBucket(out, 'pm', 'tpm')
    expect(tpmAgg.national).toEqual({ filings: 10, p25: 300_000, median: 550_000, p75: 800_000 })

    const devopsAgg = findBucket(out, 'platform', 'devops')
    expect(devopsAgg.national).toEqual({ filings: 3, p25: 150_000, median: 250_000, p75: 350_000 })
  })

  it('gates metro stats on metroMin (test with 2): includes metros at/above threshold, excludes below', () => {
    const out = aggregateTitles(allRecords, { metroMin: 2, tierMin: 2 })
    const tpmAgg = findBucket(out, 'pm', 'tpm')
    expect(Object.keys(tpmAgg.metros).sort()).toEqual(['A', 'B']) // C has only 1 filing, excluded
    expect(tpmAgg.metros.A).toEqual({ filings: 6, p25: 200_000, median: 400_000, p75: 700_000 })
    expect(tpmAgg.metros.B).toEqual({ filings: 3, p25: 400_000, median: 600_000, p75: 900_000 })
  })

  it('gates tier stats on tierMin (test with 2): senior/base/staffPlus included, lead (1 filing) excluded', () => {
    const out = aggregateTitles(allRecords, { metroMin: 2, tierMin: 2 })
    const tpmAgg = findBucket(out, 'pm', 'tpm')
    expect(Object.keys(tpmAgg.tiers).sort()).toEqual(['base', 'senior', 'staffPlus'])
    expect(tpmAgg.tiers.base).toEqual({ filings: 3, p25: 200_000, median: 700_000, p75: 800_000 })
    expect(tpmAgg.tiers.senior).toEqual({ filings: 4, p25: 100_000, median: 400_000, p75: 500_000 })
    expect(tpmAgg.tiers.staffPlus).toEqual({ filings: 2, p25: 400_000, median: 650_000, p75: 900_000 })
    expect(tpmAgg.tiers.lead).toBeUndefined()
    expect(tpmAgg.tiers.directorPlus).toBeUndefined()
  })

  it('computes socMix as top-4 by share plus an "other" remainder, sorted desc, summing to 1', () => {
    const out = aggregateTitles(allRecords, { metroMin: 2, tierMin: 2 })
    const tpmAgg = findBucket(out, 'pm', 'tpm')
    expect(tpmAgg.socMix).toEqual([
      { soc: '15-1299', share: 0.3 },
      { soc: '11-9021', share: 0.2 },
      { soc: '13-1111', share: 0.2 },
      { soc: '15-1211', share: 0.2 },
      { soc: 'other', share: 0.1 },
    ])
    const total = tpmAgg.socMix.reduce((a, m) => a + m.share, 0)
    expect(total).toBeCloseTo(1, 9)
  })

  it('computes topEmployers as top-5 by filings with case-insensitive merge, median per employer', () => {
    const out = aggregateTitles(allRecords, { metroMin: 2, tierMin: 2 })
    const tpmAgg = findBucket(out, 'pm', 'tpm')
    expect(tpmAgg.topEmployers).toHaveLength(5) // 7 distinct employers -> capped at 5
    expect(tpmAgg.topEmployers[0]).toEqual({ name: 'Acme Corp', filings: 3, median: 200_000 }) // merges "ACME CORP"
    expect(tpmAgg.topEmployers[1]).toEqual({ name: 'Beta LLC', filings: 2, median: 450_000 })
    // remaining 5 single-filing employers alphabetically: Delta Co, Epsilon Ltd, Eta Corp (top-5 cap excludes Gamma Inc, Zeta Corp)
    expect(tpmAgg.topEmployers.slice(2).map(e => e.name)).toEqual(['Delta Co', 'Epsilon Ltd', 'Eta Corp'])
  })

  it('a record whose title matches no bucket contributes nothing to any bucket', () => {
    const out = aggregateTitles(allRecords, { metroMin: 2, tierMin: 2 })
    expect(out.matchedTotal).toBe(tpm.length + devops.length) // 13, not 15
    // the $9,999,999 and $1 non-matching wages must not leak into any bucket's stats
    for (const family of out.families)
      for (const bucket of family.buckets) {
        expect(bucket.national.p75).toBeLessThan(9_999_999)
        if (bucket.national.filings > 0) expect(bucket.national.p25).toBeGreaterThan(0)
      }
  })

  it('is deterministic under input reversal', () => {
    const forward = aggregateTitles(allRecords, { metroMin: 2, tierMin: 2 })
    const reversed = aggregateTitles([...allRecords].reverse(), { metroMin: 2, tierMin: 2 })
    expect(reversed).toEqual(forward)
  })

  it('zeroes national stats for a bucket with no records instead of throwing (empty-bucket guard)', () => {
    const out = aggregateTitles(nonMatching, { metroMin: 2, tierMin: 2 })
    const tpmAgg = findBucket(out, 'pm', 'tpm')
    expect(tpmAgg.national).toEqual({ filings: 0, p25: 0, median: 0, p75: 0 })
    expect(tpmAgg.metros).toEqual({})
    expect(tpmAgg.tiers).toEqual({})
    expect(tpmAgg.socMix).toEqual([])
    expect(tpmAgg.topEmployers).toEqual([])
    expect(out.matchedTotal).toBe(0)
  })

  it('emits tier keys in a fixed order regardless of input order (toEqual cannot catch key order — compare via JSON.stringify)', () => {
    const forward = aggregateTitles(allRecords, { metroMin: 2, tierMin: 2 })
    const reversed = aggregateTitles([...allRecords].reverse(), { metroMin: 2, tierMin: 2 })
    const tpmForward = findBucket(forward, 'pm', 'tpm')
    const tpmReversed = findBucket(reversed, 'pm', 'tpm')
    expect(Object.keys(tpmForward.tiers)).toEqual(['base', 'senior', 'staffPlus'])
    expect(JSON.stringify(tpmForward.tiers)).toBe(JSON.stringify(tpmReversed.tiers))
  })

  it('uses default metroMin/tierMin thresholds when opts is omitted', () => {
    expect(() => aggregateTitles(allRecords)).not.toThrow()
    const out = aggregateTitles(allRecords)
    const tpmAgg = findBucket(out, 'pm', 'tpm')
    // defaults (metroMin: 8, tierMin: 25) are far above this fixture's counts -> everything gated out
    expect(tpmAgg.metros).toEqual({})
    expect(tpmAgg.tiers).toEqual({})
  })
})
