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
