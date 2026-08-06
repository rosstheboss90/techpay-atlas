import { describe, expect, it } from 'vitest'
import { assertWritable, buildNationalArchive, findImplausibleJumps, findTopCodeAnomaly, type NationalArchive } from '../lib/history'
import type { Pct } from '../lib/parse-oews'

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
    expect(jumps[0]).toMatchObject({ soc: '15-1252', pct: 'p50', from: 2023, to: 2024 })
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

  it('flags a p90-only distortion while leaving an unmoved p50 alone', () => {
    // p50 median is a poor detector for a wrong top code precisely because a national median
    // never approaches the ceiling — the censoring shows up in the upper percentiles instead.
    const bandFull = (p50: number, p90: number) =>
      ({ emp: 1, p10: null, p25: null, p50, p75: null, p90, capped: [] })
    const v = (year: number, p50: number, p90: number) => ({
      year, topCode: 239_200, source: `national_M${year}_dl.xlsx`, roles: { '15-1252': bandFull(p50, p90) },
    })
    const jumps = findImplausibleJumps([v(2023, 130_000, 160_000), v(2024, 130_000, 300_000)], 0.4)
    expect(jumps).toHaveLength(1)
    expect(jumps[0]).toMatchObject({ soc: '15-1252', pct: 'p90', from: 2023, to: 2024 })
  })
})

describe('findTopCodeAnomaly', () => {
  const role = (vals: Partial<{
    p10: number | null; p25: number | null; p50: number | null; p75: number | null; p90: number | null
  }>, capped: Pct[]) =>
    ({ emp: 1, p10: null, p25: null, p50: null, p75: null, p90: null, ...vals, capped })

  it('finds no anomaly when uncapped values run close under the recorded top code', () => {
    const archive: NationalArchive = {
      year: 2025, topCode: 239_200, source: 'f.xlsx',
      roles: { '15-1252': role({ p75: 230_000, p90: 239_200 }, ['p90']) },
    }
    expect(findTopCodeAnomaly(archive, 0.1)).toBeNull()
  })

  it('flags a vintage with capped cells at 239,200 but nothing uncapped above ~185,000', () => {
    const archive: NationalArchive = {
      year: 2019, topCode: 239_200, source: 'f.xlsx',
      roles: { '15-1252': role({ p75: 185_000, p90: 239_200 }, ['p90']) },
    }
    const anomaly = findTopCodeAnomaly(archive, 0.1)
    expect(anomaly).not.toBeNull()
    expect(anomaly).toMatchObject({ year: 2019, topCode: 239_200, maxUncapped: 185_000, cappedCells: 1 })
    expect(anomaly!.gap).toBeGreaterThan(0.1)
  })

  it('finds no anomaly when a vintage has zero capped cells, no matter how low its values are', () => {
    const archive: NationalArchive = {
      year: 2019, topCode: 239_200, source: 'f.xlsx',
      roles: { '15-1252': role({ p10: 20_000, p50: 40_000, p90: 60_000 }, []) },
    }
    expect(findTopCodeAnomaly(archive, 0.1)).toBeNull()
  })

  it('does not throw or produce -Infinity when a role has capped cells but no uncapped values at all', () => {
    const archive: NationalArchive = {
      year: 2019, topCode: 239_200, source: 'f.xlsx',
      roles: { '15-1252': role({}, ['p90']) },
    }
    const anomaly = findTopCodeAnomaly(archive, 0.1)
    expect(anomaly).not.toBeNull()
    expect(Number.isFinite(anomaly!.maxUncapped)).toBe(true)
    expect(Number.isFinite(anomaly!.gap)).toBe(true)
  })
})
