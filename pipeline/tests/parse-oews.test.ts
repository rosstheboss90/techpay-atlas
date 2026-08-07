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

// MEASURED 2026-08-06 against data/raw/oesm19ma/MSA_M2019_dl.xlsx: May 2019's MSA file uses
// all-lowercase headers (area, area_title, occ_code, tot_emp, a_pct10, ...) and has NO
// prim_state column at all. 2020+ vintages are uppercase and include PRIM_STATE. The parser
// must resolve the columns it reads case-insensitively, and treat PRIM_STATE as optional,
// so 2019 doesn't fall out of the zod schema and trip the archiver's zero-metros guard.
describe('parseOews - column casing drift (2019 lowercase, no PRIM_STATE)', () => {
  // Same values as the base fixture above, but with 2019's actual lowercase headers and no
  // prim_state key at all.
  const rowLower = (over: Record<string, unknown> = {}) => ({
    area: 12420, area_title: 'Austin-Round Rock-San Marcos, TX',
    occ_code: '15-1252', o_group: 'detailed', tot_emp: '31,590', loc_quotient: '2.19',
    a_pct10: '75,000', a_pct25: '96,000', a_median: '132,000', a_pct75: '168,000', a_pct90: '205,000',
    ...over,
  })

  it('parses a lowercase-header row (2019 shape) to the same records as the uppercase equivalent', () => {
    const upper = oewsRowsToRecords([row()])
    const lower = oewsRowsToRecords([rowLower()])
    expect(lower).toEqual(upper)
  })

  it('resolves mixed/odd casing headers (Occ_Code, a_MEDIAN, ...)', () => {
    const mixed = {
      Area: 12420, Area_Title: 'Austin-Round Rock-San Marcos, TX', Prim_State: 'TX',
      Occ_Code: '15-1252', Tot_Emp: '31,590', Loc_Quotient: '2.19',
      a_PCT10: '75,000', A_pct25: '96,000', a_MEDIAN: '132,000', A_Pct75: '168,000', a_pct90: '205,000',
    }
    const [r] = oewsRowsToRecords([mixed])
    expect(r).toEqual({
      cbsa: '12420', soc: '15-1252', emp: 31590, lq: 2.19,
      p10: 75000, p25: 96000, p50: 132000, p75: 168000, p90: 205000, capped: [],
    })
  })

  it('yields the metro in areas with state \'\' when PRIM_STATE is absent entirely (2019 shape)', () => {
    const areas = extractAreas([rowLower()])
    expect(areas.get('12420')).toEqual({ name: 'Austin-Round Rock-San Marcos, TX', state: '' })
  })
})
