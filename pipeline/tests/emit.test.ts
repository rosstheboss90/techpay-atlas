import { describe, expect, it } from 'vitest'
import { buildEmployerFiles, buildMeta, buildSalaries, buildTitles } from '../lib/emit'
import type { SalaryRecord } from '../lib/parse-oews'
import type { EmployerBundle } from '../lib/aggregate'
import type { TitleBucketAgg } from '../lib/aggregate-titles'
import { TOP_CODE } from '../lib/num'

const salaries: SalaryRecord[] = [
  { cbsa: '12420', soc: '15-1252', emp: 31590, lq: 2.19, p10: 75000, p25: 96000, p50: 132000, p75: 168000, p90: 205000, capped: [] },
  { cbsa: '12420', soc: '15-2051', emp: 2100, lq: 1.4, p10: 80000, p25: 100000, p50: 125000, p75: 150000, p90: 190000, capped: ['p90'] },
  { cbsa: '19100', soc: '15-1252', emp: 60000, lq: 1.5, p10: 78000, p25: 99000, p50: 128000, p75: 160000, p90: 199000, capped: [] },
]
const areas = new Map([
  ['12420', { name: 'Austin-Round Rock-San Marcos, TX', state: 'TX' }],
  ['19100', { name: 'Dallas-Fort Worth-Arlington, TX', state: 'TX' }],
])
const coords = new Map([['12420', { lat: 30.3, lng: -97.7 }], ['19100', { lat: 32.8, lng: -97.0 }]])
const rpp = { year: 2023, values: new Map([['12420', 103.6]]) } // Dallas intentionally missing

const filingsByCbsa = new Map([['12420', 42]]) // Dallas (19100) intentionally absent -> lcaFilings 0

describe('golden: fixtures in -> site JSON out', () => {
  it('buildMeta joins areas, coords, rpp; missing rpp -> null; metros without coords are dropped and reported', () => {
    const { meta, droppedNoArea, droppedNoCoords } = buildMeta(salaries, areas, coords, rpp, 2025, filingsByCbsa)
    expect(meta.year).toBe(2025)
    expect(meta.roles).toHaveLength(21)
    expect(meta.topCodeValue).toBe(TOP_CODE)
    expect(meta.rppYear).toBe(2023)
    expect(meta.metros).toEqual([
      { cbsa: '12420', name: 'Austin-Round Rock-San Marcos, TX', state: 'TX', lat: 30.3, lng: -97.7, rpp: 103.6, lcaFilings: 42 },
      { cbsa: '19100', name: 'Dallas-Fort Worth-Arlington, TX', state: 'TX', lat: 32.8, lng: -97.0, rpp: null, lcaFilings: 0 },
    ])
    expect(droppedNoArea).toEqual([])
    expect(droppedNoCoords).toEqual([])
  })
  it('buildMeta stamps placeholder lcaPeriod/sources for run.ts to fill in at write time', () => {
    const { meta } = buildMeta(salaries, areas, coords, rpp, 2025, filingsByCbsa)
    expect(meta.lcaPeriod).toBe('')
    expect(meta.sources).toEqual({ oews: '', lca: [], hud: '', zipMatchRate: 0 })
  })
  it('buildMeta drops (and reports) a metro with no coordinates', () => {
    const { meta, droppedNoArea, droppedNoCoords } = buildMeta(salaries, areas, new Map([['12420', { lat: 30.3, lng: -97.7 }]]), rpp, 2025, filingsByCbsa)
    expect(meta.metros.map(m => m.cbsa)).toEqual(['12420'])
    expect(droppedNoArea).toEqual([])
    expect(droppedNoCoords).toEqual(['19100'])
  })
  it('buildMeta drops (and reports) a metro present in salaries but absent from areas', () => {
    const { meta, droppedNoArea, droppedNoCoords } = buildMeta(
      salaries, new Map([['12420', { name: 'Austin-Round Rock-San Marcos, TX', state: 'TX' }]]), coords, rpp, 2025, filingsByCbsa)
    expect(meta.metros.map(m => m.cbsa)).toEqual(['12420'])
    expect(droppedNoArea).toEqual(['19100'])
    expect(droppedNoCoords).toEqual([])
  })
  it('buildSalaries nests cbsa -> soc, omitting capped when empty and including it when set', () => {
    const keep = new Set(['12420', '19100'])
    const { salaries: out, excluded } = buildSalaries(salaries, keep)
    expect(out['12420']['15-2051']).toEqual(
      { emp: 2100, lq: 1.4, p10: 80000, p25: 100000, p50: 125000, p75: 150000, p90: 190000, capped: ['p90'] })
    expect(out['12420']['15-1252']).toEqual(
      { emp: 31590, lq: 2.19, p10: 75000, p25: 96000, p50: 132000, p75: 168000, p90: 205000 })
    expect('capped' in out['12420']['15-1252']).toBe(false)
    expect(Object.keys(out)).toEqual(['12420', '19100'])
    expect(excluded).toBe(0)
  })
  it('buildSalaries filters rows to the accepted CBSA set and reports how many were excluded', () => {
    const keep = new Set(['12420']) // Dallas (19100) is not in the accepted metro set
    const { salaries: out, excluded } = buildSalaries(salaries, keep)
    expect(Object.keys(out)).toEqual(['12420'])
    expect(excluded).toBe(1) // the one 19100 row
  })
  it('buildEmployerFiles emits one file body per cbsa', () => {
    const bundle: EmployerBundle = { employers: [{ name: 'Acme Corp', filings: 3, median: 160000 }], sample: [150000, 160000, 170000], n: 3, p99: 170000 }
    const agg = new Map([['12420', new Map([['15-1252', bundle]])]])
    const { files, excluded } = buildEmployerFiles(agg, new Set(['12420']))
    expect(files).toEqual([{ cbsa: '12420', body: { cbsa: '12420', roles: { '15-1252': bundle } } }])
    expect(excluded).toBe(0)
  })
  it('buildEmployerFiles filters to the accepted CBSA set and reports how many were excluded', () => {
    const bundle: EmployerBundle = { employers: [{ name: 'Acme Corp', filings: 3, median: 160000 }], sample: [150000, 160000, 170000], n: 3, p99: 170000 }
    const agg = new Map([['12420', new Map([['15-1252', bundle]])], ['19100', new Map([['15-1252', bundle]])]])
    const { files, excluded } = buildEmployerFiles(agg, new Set(['12420']))
    expect(files.map(f => f.cbsa)).toEqual(['12420'])
    expect(excluded).toBe(1)
  })
})

describe('golden: aggregateTitles output -> titles.json shape (buildTitles)', () => {
  const tpmBucket: TitleBucketAgg = {
    key: 'tpm', label: 'Technical Program Manager',
    national: { filings: 5, p25: 150000, median: 172000, p75: 200000 },
    metros: { '12420': { filings: 8, p25: 150000, median: 172000, p75: 200000 } },
    tiers: { senior: { filings: 25, p25: 160000, median: 185000, p75: 210000 } },
    socMix: [{ soc: '15-1299', share: 1 }],
    topEmployers: [{ name: 'Acme Corp', filings: 5, median: 172000 }],
  }
  const pmoBucket: TitleBucketAgg = {
    key: 'pmo', label: 'PMO',
    national: { filings: 3, p25: 90000, median: 95000, p75: 100000 },
    metros: {}, tiers: {}, socMix: [], topEmployers: [],
  }
  const agg = {
    matchedTotal: 8,
    families: [{ key: 'pm', label: 'PM & Product', buckets: [tpmBucket, pmoBucket] }],
  }

  it('maps aggregateTitles families/buckets verbatim and stamps lcaPeriod', () => {
    const out = buildTitles(agg, 'FY2025 Q1–Q4')
    expect(out.lcaPeriod).toBe('FY2025 Q1–Q4')
    // Literal expected structure — not `agg.families` by reference — so this actually
    // exercises buildTitles's mapping instead of comparing a value to itself.
    expect(out.families).toEqual([
      {
        key: 'pm', label: 'PM & Product',
        buckets: [
          {
            key: 'tpm', label: 'Technical Program Manager',
            national: { filings: 5, p25: 150000, median: 172000, p75: 200000 },
            metros: { '12420': { filings: 8, p25: 150000, median: 172000, p75: 200000 } },
            tiers: { senior: { filings: 25, p25: 160000, median: 185000, p75: 210000 } },
            socMix: [{ soc: '15-1299', share: 1 }],
            topEmployers: [{ name: 'Acme Corp', filings: 5, median: 172000 }],
          },
          {
            key: 'pmo', label: 'PMO',
            national: { filings: 3, p25: 90000, median: 95000, p75: 100000 },
            metros: {}, tiers: {}, socMix: [], topEmployers: [],
          },
        ],
      },
    ])
  })

  it('does not leak matchedTotal (not part of the emitted contract)', () => {
    const out = buildTitles(agg, 'FY2025 Q1–Q4')
    expect('matchedTotal' in out).toBe(false)
  })

  it('an empty-tier bucket serializes with no tier keys present', () => {
    const out = buildTitles(agg, 'FY2025 Q1–Q4')
    const pmo = out.families[0].buckets.find(b => b.key === 'pmo')!
    expect(Object.keys(pmo.tiers)).toEqual([])
    const roundTripped = JSON.parse(JSON.stringify(out))
    expect(Object.keys(roundTripped.families[0].buckets[1].tiers)).toEqual([])
  })
})
