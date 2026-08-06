import { describe, expect, it } from 'vitest'
import { assertWritable, buildNationalArchive } from '../lib/history'

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
