import { describe, expect, it } from 'vitest'
import { extractAreas, oewsRowsToRecords, parseOews } from '../lib/parse-oews'

const row = (over: Record<string, unknown> = {}) => ({
  AREA: 12420, AREA_TITLE: 'Austin-Round Rock-San Marcos, TX', PRIM_STATE: 'TX',
  OCC_CODE: '15-1252', O_GROUP: 'detailed', TOT_EMP: '31,590', LOC_QUOTIENT: '2.19',
  A_PCT10: '75,000', A_PCT25: '96,000', A_MEDIAN: '132,000', A_PCT75: '168,000', A_PCT90: '205,000',
  ...over,
})

describe('oewsRowsToRecords', () => {
  it('maps a detailed target-SOC row, zero-padding CBSA', () => {
    const [r] = oewsRowsToRecords([row({ AREA: 9999 })])
    expect(r).toEqual({
      cbsa: '09999', soc: '15-1252', emp: 31590, lq: 2.19,
      p10: 75000, p25: 96000, p50: 132000, p75: 168000, p90: 205000, capped: [],
    })
  })
  it('drops non-target SOC rows (including 00-0000 rollups)', () => {
    expect(oewsRowsToRecords([row({ OCC_CODE: '00-0000', O_GROUP: 'total' })])).toEqual([])
    expect(oewsRowsToRecords([row({ OCC_CODE: '29-1141' })])).toEqual([])
  })
  it('turns suppression markers into nulls, never zeros', () => {
    const [r] = oewsRowsToRecords([row({ TOT_EMP: '**', LOC_QUOTIENT: '*' })])
    expect(r.emp).toBeNull(); expect(r.lq).toBeNull()
    expect(r.p10).toBe(75000)
  })
  it('treats # as a top-code (>= $239,200), not suppression, and records which percentiles were capped', () => {
    const [r] = oewsRowsToRecords([row({ A_MEDIAN: '#', A_PCT90: '#' })])
    expect(r.p50).toBe(239200)
    expect(r.p90).toBe(239200)
    expect(r.capped).toEqual(['p50', 'p90'])
    expect(r.p10).toBe(75000)
  })
  it('throws on a target row missing required columns (schema drift fails loudly)', () => {
    expect(() => oewsRowsToRecords([{ OCC_CODE: '15-1252' }])).toThrow()
  })
})

describe('extractAreas', () => {
  it('collects metro name/state per CBSA', () => {
    const areas = extractAreas([row()])
    expect(areas.get('12420')).toEqual({ name: 'Austin-Round Rock-San Marcos, TX', state: 'TX' })
  })
})

describe('parseOews (single-pass)', () => {
  it('returns the same records and areas as the two-pass functions, in one walk of the rows', () => {
    const rows = [row({ AREA: 9999 }), row({ AREA: 9999, OCC_CODE: '15-2051' })]
    const { records, areas } = parseOews(rows)
    expect(records).toEqual(oewsRowsToRecords(rows))
    expect(areas).toEqual(extractAreas(rows))
    expect(areas.get('09999')).toEqual({ name: 'Austin-Round Rock-San Marcos, TX', state: 'TX' })
  })
})
