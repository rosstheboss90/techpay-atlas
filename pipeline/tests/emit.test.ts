import { describe, expect, it } from 'vitest'
import { buildEmployerFiles, buildMeta, buildSalaries } from '../lib/emit'
import type { SalaryRecord } from '../lib/parse-oews'
import type { EmployerBundle } from '../lib/aggregate'
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
const rpp = new Map([['12420', 103.6]]) // Dallas intentionally missing

describe('golden: fixtures in -> site JSON out', () => {
  it('buildMeta joins areas, coords, rpp; missing rpp -> null; metros without coords are dropped and reported', () => {
    const { meta, dropped } = buildMeta(salaries, areas, coords, rpp, 2025)
    expect(meta.year).toBe(2025)
    expect(meta.roles).toHaveLength(18)
    expect(meta.capValue).toBe(TOP_CODE)
    expect(meta.metros).toEqual([
      { cbsa: '12420', name: 'Austin-Round Rock-San Marcos, TX', state: 'TX', lat: 30.3, lng: -97.7, rpp: 103.6 },
      { cbsa: '19100', name: 'Dallas-Fort Worth-Arlington, TX', state: 'TX', lat: 32.8, lng: -97.0, rpp: null },
    ])
    expect(dropped).toEqual([])
  })
  it('buildMeta drops (and reports) a metro with no coordinates', () => {
    const { meta, dropped } = buildMeta(salaries, areas, new Map([['12420', { lat: 30.3, lng: -97.7 }]]), rpp, 2025)
    expect(meta.metros.map(m => m.cbsa)).toEqual(['12420'])
    expect(dropped).toEqual(['19100'])
  })
  it('buildSalaries nests cbsa -> soc, omitting capped when empty and including it when set', () => {
    const out = buildSalaries(salaries)
    expect(out['12420']['15-2051']).toEqual(
      { emp: 2100, lq: 1.4, p10: 80000, p25: 100000, p50: 125000, p75: 150000, p90: 190000, capped: ['p90'] })
    expect(out['12420']['15-1252']).toEqual(
      { emp: 31590, lq: 2.19, p10: 75000, p25: 96000, p50: 132000, p75: 168000, p90: 205000 })
    expect('capped' in out['12420']['15-1252']).toBe(false)
    expect(Object.keys(out)).toEqual(['12420', '19100'])
  })
  it('buildEmployerFiles emits one file body per cbsa', () => {
    const bundle: EmployerBundle = { employers: [{ name: 'Acme Corp', filings: 3, median: 160000 }], sample: [150000, 160000, 170000], n: 3 }
    const files = buildEmployerFiles(new Map([['12420', new Map([['15-1252', bundle]])]]))
    expect(files).toEqual([{ cbsa: '12420', body: { cbsa: '12420', roles: { '15-1252': bundle } } }])
  })
})
