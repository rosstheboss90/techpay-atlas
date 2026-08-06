import { describe, expect, it } from 'vitest'
import { assertWritable, buildNationalArchive, findImplausibleJumps } from '../lib/history'

describe('assertWritable', () => {
  it('allows writing a vintage that has not been archived yet', () => {
    expect(() => assertWritable(2019, { exists: false, force: false })).not.toThrow()
  })

  it('REFUSES to overwrite an existing vintage — history is append-only', () => {
    expect(() => assertWritable(2019, { exists: true, force: false }))
      .toThrow(/oews-nat-2019\.json already exists/)
  })

  it('allows an explicit forced overwrite', () => {
    expect(() => assertWritable(2019, { exists: true, force: true })).not.toThrow()
  })
})

describe('buildNationalArchive', () => {
  const roles = {
    '15-1252': { emp: 1656880, p10: 81440, p25: 102010, p50: 133080, p75: 168570, p90: 208620, capped: [] },
  }

  it('stamps the vintage year, its top code, and the source filename', () => {
    const out = buildNationalArchive(2019, 208_000, 'national_M2019_dl.xlsx', roles)
    expect(out.year).toBe(2019)
    expect(out.topCode).toBe(208_000)
    expect(out.source).toBe('national_M2019_dl.xlsx')
  })

  it('stores the top code IN the file so a future reader never infers it from current code', () => {
    const out = buildNationalArchive(2019, 208_000, 'national_M2019_dl.xlsx', roles)
    expect(out.topCode).not.toBe(239_200)
  })

  it('passes the role band through unchanged', () => {
    expect(buildNationalArchive(2025, 239_200, 'f.xlsx', roles).roles).toEqual(roles)
  })

  it('throws when handed zero roles rather than archiving an empty vintage', () => {
    expect(() => buildNationalArchive(2025, 239_200, 'f.xlsx', {}))
      .toThrow(/refusing to archive vintage 2025 with 0 roles/)
  })
})

describe('findImplausibleJumps', () => {
  const band = (p50: number) => ({ emp: 1, p10: null, p25: null, p50, p75: null, p90: null, capped: [] })
  const vintage = (year: number, p50: number) => ({
    year, topCode: 239_200, source: `national_M${year}_dl.xlsx`, roles: { '15-1252': band(p50) },
  })

  it('passes a series with ordinary year-over-year movement', () => {
    expect(findImplausibleJumps([vintage(2023, 130_000), vintage(2024, 138_000)], 0.4)).toEqual([])
  })

  it('flags a jump beyond the threshold — the signature of a wrong top code or deflator', () => {
    const jumps = findImplausibleJumps([vintage(2023, 130_000), vintage(2024, 260_000)], 0.4)
    expect(jumps).toHaveLength(1)
    expect(jumps[0]).toMatchObject({ soc: '15-1252', from: 2023, to: 2024 })
  })

  it('flags large drops as well as rises', () => {
    expect(findImplausibleJumps([vintage(2023, 200_000), vintage(2024, 100_000)], 0.4)).toHaveLength(1)
  })

  it('compares in year order regardless of input order', () => {
    expect(findImplausibleJumps([vintage(2024, 138_000), vintage(2023, 130_000)], 0.4)).toEqual([])
  })

  it('ignores a role that is absent in the earlier vintage (young SOC code)', () => {
    const a = { year: 2020, topCode: 208_000, source: 'a', roles: {} }
    expect(findImplausibleJumps([a, vintage(2021, 130_000)], 0.4)).toEqual([])
  })

  it('ignores a null median rather than treating it as zero', () => {
    // Must exercise the null branch specifically — a fixture using 0 would be skipped by the
    // divide-by-zero guard instead, and the test would pass for the wrong reason.
    const prev = vintage(2023, 130_000)
    const cur = { year: 2024, topCode: 239_200, source: 'b', roles: { '15-1252': band(0) } }
    cur.roles['15-1252'].p50 = null as unknown as number
    expect(findImplausibleJumps([prev, cur], 0.4)).toEqual([])
  })
})
