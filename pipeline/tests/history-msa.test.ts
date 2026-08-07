import { describe, expect, it } from 'vitest'
import { buildMsaArchive, msaArchiveFilename } from '../lib/history'

const rec = (p50: number) => ({ p50, emp: 100, capped: [] })

describe('msaArchiveFilename', () => {
  it('sits beside the national archive under a distinct name', () => {
    expect(msaArchiveFilename(2019)).toBe('oews-msa-2019.json')
  })
})

describe('buildMsaArchive', () => {
  const areas = new Map([['12420', { name: 'Austin-Round Rock, TX', state: 'TX' }]])
  const metros = { '12420': { '15-1252': rec(120000) } }

  it('stamps year, top code and source', () => {
    const a = buildMsaArchive(2019, 208_000, 'MSA_M2019_dl.xlsx', areas, metros)
    expect(a.year).toBe(2019)
    expect(a.topCode).toBe(208_000)
    expect(a.source).toBe('MSA_M2019_dl.xlsx')
  })

  it('records each metro title — this is the delineation signal', () => {
    const a = buildMsaArchive(2019, 208_000, 'f.xlsx', areas, metros)
    expect(a.areas['12420']).toBe('Austin-Round Rock, TX')
  })

  it('passes metro role records through unchanged', () => {
    const a = buildMsaArchive(2019, 208_000, 'f.xlsx', areas, metros)
    expect(a.metros['12420']['15-1252'].p50).toBe(120000)
  })

  it('throws rather than archiving a vintage with no metros', () => {
    expect(() => buildMsaArchive(2019, 208_000, 'f.xlsx', new Map(), {}))
      .toThrow(/refusing to archive MSA vintage 2019 with 0 metros/)
  })

  it('throws when a metro has records but no title', () => {
    // A metro with wage rows but no AREA_TITLE would silently lose its delineation
    // signal and never register a break.
    expect(() => buildMsaArchive(2019, 208_000, 'f.xlsx', new Map(), metros))
      .toThrow(/12420 has records but no area title/)
  })
})
