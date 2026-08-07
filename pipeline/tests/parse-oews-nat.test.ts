import { describe, expect, it } from 'vitest'
import { parseOewsNational } from '../lib/parse-oews-nat'

// Base fixture is the MEASURED real row for Software Developers (15-1252) from
// data/raw/oesm25nat/national_M2025_dl.xlsx, May 2025 vintage.
const row = (over: Record<string, unknown> = {}) => ({
  AREA: '99', AREA_TITLE: 'U.S.', AREA_TYPE: '1', PRIM_STATE: 'US',
  NAICS: '000000', NAICS_TITLE: 'Cross-industry', I_GROUP: 'cross-industry', OWN_CODE: '1235',
  OCC_CODE: '15-1252', OCC_TITLE: 'Software Developers', O_GROUP: 'detailed',
  TOT_EMP: 1687890, EMP_PRSE: 0.6, JOBS_1000: null, LOC_QUOTIENT: null, PCT_TOTAL: null, PCT_RPT: null,
  H_MEAN: 71.2, A_MEAN: 148100, MEAN_PRSE: 0.4,
  H_PCT10: 39.64, H_PCT25: 50.58, H_MEDIAN: 65.38, H_PCT75: 82.68, H_PCT90: 103.21,
  A_PCT10: 82460, A_PCT25: 105210, A_MEDIAN: 135980, A_PCT75: 171980, A_PCT90: 214670,
  ANNUAL: '', HOURLY: '',
  ...over,
})

const TOP_CODE = 239_200

describe('parseOewsNational', () => {
  it('keeps a detailed row whose OCC_CODE is a registry SOC', () => {
    const out = parseOewsNational([row()], TOP_CODE)
    expect(out['15-1252']).toEqual({
      emp: 1687890, p10: 82460, p25: 105210, p50: 135980, p75: 171980, p90: 214670, capped: [],
    })
  })

  it('drops a row whose OCC_CODE is not in the registry', () => {
    // Paired with a matching row so the case under test is the FILTER, not the
    // zero-registry-SOCs throw (covered separately below).
    const out = parseOewsNational([row(), row({ OCC_CODE: '29-1141', OCC_TITLE: 'Registered Nurses' })], TOP_CODE)
    expect(Object.keys(out)).toEqual(['15-1252'])
  })

  it('drops a rollup row even when its OCC_CODE matches a registry SOC prefix trick', () => {
    // A rollup row for the SAME occupation code but O_GROUP != 'detailed' must not be kept —
    // this is the case an OCC_CODE-only filter would silently get wrong. Paired with a genuine
    // detailed row for a DIFFERENT SOC so the rollup's exclusion is what's under test.
    const out = parseOewsNational(
      [row({ O_GROUP: 'major' }), row({ OCC_CODE: '15-2051', OCC_TITLE: 'Data Scientists' })],
      TOP_CODE,
    )
    expect(Object.keys(out)).toEqual(['15-2051'])
  })

  it('never produces a CBSA-shaped key — every key matches SOC shape', () => {
    const out = parseOewsNational([row(), row({ OCC_CODE: '15-2051', OCC_TITLE: 'Data Scientists' })], TOP_CODE)
    for (const key of Object.keys(out)) {
      expect(key).toMatch(/^\d{2}-\d{4}$/)
    }
  })

  it('maps suppression markers (*, **, blank) to null, never 0', () => {
    const out = parseOewsNational([row({ TOT_EMP: '**', A_PCT10: '*', A_PCT25: '' })], TOP_CODE)
    expect(out['15-1252'].emp).toBeNull()
    expect(out['15-1252'].p10).toBeNull()
    expect(out['15-1252'].p25).toBeNull()
    expect(out['15-1252'].p50).toBe(135980)
  })

  it('treats # as a top-code at the PASSED topCode value, not the num.ts TOP_CODE constant', () => {
    const passedTopCode = 208_000 // deliberately != num.ts's TOP_CODE (239,200)
    const out = parseOewsNational([row({ A_MEDIAN: '#', A_PCT90: '#' })], passedTopCode)
    expect(out['15-1252'].p50).toBe(passedTopCode)
    expect(out['15-1252'].p90).toBe(passedTopCode)
    expect(out['15-1252'].capped).toEqual(['p50', 'p90'])
  })

  it('throws when zero registry SOCs are found (wrong file or schema drift)', () => {
    expect(() => parseOewsNational([row({ OCC_CODE: '29-1141' })], TOP_CODE))
      .toThrow(/no registry SOC/i)
  })

  it('throws on an empty row set', () => {
    expect(() => parseOewsNational([], TOP_CODE)).toThrow(/no registry SOC/i)
  })
})

// MEASURED 2026-08-06 against the real files on disk: May 2019's national_M2019_dl.xlsx uses
// all-lowercase headers (occ_code, o_group, tot_emp, a_pct10, ...) and has no PRIM_STATE column
// at all; 2020 is uppercase with PRIM_STATE added; 2021+ additionally adds PCT_RPT. The parser
// must resolve the fields it reads case-insensitively so 2019 doesn't crash the zero-rows guard.
describe('parseOewsNational - column casing drift (2019 lowercase, no PRIM_STATE)', () => {
  // Same values as the base fixture above, but with 2019's actual lowercase headers and no
  // PRIM_STATE key at all.
  const rowLower = (over: Record<string, unknown> = {}) => ({
    area: '99', area_title: 'U.S.', area_type: '1',
    naics: '000000', naics_title: 'Cross-industry', i_group: 'cross-industry', own_code: '1235',
    occ_code: '15-1252', occ_title: 'Software Developers', o_group: 'detailed',
    tot_emp: 1687890, emp_prse: 0.6, jobs_1000: null, loc_quotient: null, pct_total: null,
    h_mean: 71.2, a_mean: 148100, mean_prse: 0.4,
    h_pct10: 39.64, h_pct25: 50.58, h_median: 65.38, h_pct75: 82.68, h_pct90: 103.21,
    a_pct10: 82460, a_pct25: 105210, a_median: 135980, a_pct75: 171980, a_pct90: 214670,
    annual: '', hourly: '',
    ...over,
  })

  it('parses a lowercase-header row (2019 shape) identically to the uppercase equivalent', () => {
    const upper = parseOewsNational([row()], TOP_CODE)
    const lower = parseOewsNational([rowLower()], TOP_CODE)
    expect(lower).toEqual(upper)
  })

  it('resolves mixed/odd casing headers (Occ_Code, a_MEDIAN, ...)', () => {
    const mixed = {
      Occ_Code: '15-1252', O_Group: 'detailed', Tot_Emp: 1687890,
      a_PCT10: 82460, A_pct25: 105210, a_MEDIAN: 135980, A_Pct75: 171980, a_pct90: 214670,
    }
    const out = parseOewsNational([mixed], TOP_CODE)
    expect(out['15-1252']).toEqual({
      emp: 1687890, p10: 82460, p25: 105210, p50: 135980, p75: 171980, p90: 214670, capped: [],
    })
  })

  it('does not silently drop every row when O_GROUP is absent entirely from the file', () => {
    const { O_GROUP, ...noOGroup } = row()
    const out = parseOewsNational([noOGroup], TOP_CODE)
    expect(out['15-1252']).toBeDefined()
    expect(out['15-1252'].p50).toBe(135980)
  })
})
