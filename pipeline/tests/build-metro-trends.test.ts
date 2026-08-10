import { describe, expect, it } from 'vitest'
import { buildMetroTrend } from '../lib/build-metro-trends'
import type { MsaArchive } from '../lib/history'

const cpi = { 2019: 256.092, 2020: 256.394, 2021: 269.195, 2022: 292.296, 2023: 304.127, 2024: 314.069, 2025: 321.465 }

const v = (year: number, p50: number | null, title = 'Austin-Round Rock, TX'): MsaArchive => ({
  year, topCode: 239_200, source: `MSA_M${year}_dl.xlsx`,
  areas: { '12420': title },
  metros: { '12420': { '15-1252': { p50, emp: 100, capped: [] } } },
})

const del = { '12420': { breaks: [], firstYear: 2021, lastYear: 2025, absentYears: [] } }

describe('buildMetroTrend', () => {
  it('deflates to the base year, leaving the base year nominal', () => {
    const t = buildMetroTrend('12420', [v(2021, 120730), v(2025, 135980)], cpi, 2025, del)
    expect(t).not.toBeNull()
    expect(t!.roles['15-1252'].nominal).toEqual([120730, 135980])
    expect(t!.roles['15-1252'].real[1]).toBe(135980)
    expect(t!.roles['15-1252'].real[0]).toBeCloseTo(144172.3, 0)
  })

  it('uses the newest vintage title as the metro name', () => {
    const t = buildMetroTrend('12420',
      [v(2021, 1, 'Austin-Round Rock, TX'), v(2025, 2, 'Austin-Round Rock-San Marcos, TX')], cpi, 2025, del)
    expect(t).not.toBeNull()
    expect(t!.name).toBe('Austin-Round Rock-San Marcos, TX')
  })

  it('emits null for a suppressed cell rather than dropping the year', () => {
    const t = buildMetroTrend('12420', [v(2021, null), v(2025, 135980)], cpi, 2025, del)
    expect(t).not.toBeNull()
    expect(t!.years).toEqual([2021, 2025])
    expect(t!.roles['15-1252'].nominal).toEqual([null, 135980])
    expect(t!.roles['15-1252'].real[0]).toBeNull()
  })

  it('emits null for a year the metro is absent from entirely', () => {
    const a = v(2021, 120730)
    const b: MsaArchive = { ...v(2025, 0), areas: {}, metros: {} }
    const t = buildMetroTrend('12420', [a, b], cpi, 2025, del)
    expect(t).not.toBeNull()
    expect(t!.roles['15-1252'].nominal).toEqual([120730, null])
  })

  it('carries the delineation breaks through, titles and all', () => {
    // Full break objects, not just years — see the doc comment on MetroTrend.breaks. The panel
    // needs `from`/`to` to name what changed, not only when.
    const t = buildMetroTrend('12420', [v(2021, 1), v(2025, 2)], cpi, 2025, {
      '12420': {
        breaks: [{ year: 2025, from: 'Austin-Round Rock, TX', to: 'Austin-Round Rock-San Marcos, TX' }],
        firstYear: 2021, lastYear: 2025, absentYears: [],
      },
    })
    expect(t).not.toBeNull()
    expect(t!.breaks).toEqual([
      { year: 2025, from: 'Austin-Round Rock, TX', to: 'Austin-Round Rock-San Marcos, TX' },
    ])
  })

  it('a p90-only capped cell is never flagged and never nulls the plotted median (this is a median chart)', () => {
    const a = v(2021, 120730)
    a.metros['12420']['15-1252'].capped = ['p90']
    const t = buildMetroTrend('12420', [a, v(2025, 135980)], cpi, 2025, del)
    expect(t).not.toBeNull()
    expect(t!.roles['15-1252'].capped).toEqual([false, false])
    expect(t!.roles['15-1252'].nominal[0]).toBe(120730)
  })

  it('a p50-capped cell IS flagged and nulls the plotted median (the top-code floor is not a real value)', () => {
    const a = v(2021, 208_000)
    a.metros['12420']['15-1252'].capped = ['p50', 'p90']
    const t = buildMetroTrend('12420', [a, v(2025, 135980)], cpi, 2025, del)
    expect(t).not.toBeNull()
    expect(t!.roles['15-1252'].capped).toEqual([true, false])
    expect(t!.roles['15-1252'].nominal[0]).toBeNull()
    expect(t!.roles['15-1252'].real[0]).toBeNull()
  })

  it('throws when a year has no CPI value rather than silently dropping it', () => {
    expect(() => buildMetroTrend('12420', [v(2021, 1)], { 2025: 321.465 }, 2025, del))
      .toThrow(/no CPI value for 2021/)
  })

  it('returns null for a metro absent from every vintage', () => {
    expect(buildMetroTrend('99999', [v(2021, 1)], cpi, 2025, del)).toBeNull()
  })
})

// Regression fixture for docs/BACKLOG.md 2026-08-09: the p50/p90 misread. Three real vintages
// (topCode boundary at May 2022, per pipeline/vintages.ts) with four roles covering every case:
//  (a) 11-3021 — p50-capped in 2020 ONLY (the BLS top-code floor, 208000)
//  (b) 15-1252 — p90-only capped every year, p50 never capped (real values throughout)
//  (c) 15-2051 — absent from every vintage entirely (never published here)
//  (d) 15-1221 — p50-capped in ALL three vintages (a floor every year, never a real value)
describe('censored medians derive capped/null from p50, not p90', () => {
  const cpi3 = { 2020: 256.394, 2021: 269.195, 2022: 292.296 }
  const archive2020: MsaArchive = {
    year: 2020, topCode: 208_000, source: 'MSA_M2020_dl.xlsx',
    areas: { '12420': 'Austin-Round Rock, TX' },
    metros: {
      '12420': {
        '11-3021': { p50: 208_000, emp: 100, capped: ['p50', 'p90'] },
        '15-1252': { p50: 140_000, emp: 100, capped: ['p90'] },
        '15-1221': { p50: 208_000, emp: 100, capped: ['p50', 'p90'] },
      },
    },
  }
  const archive2021: MsaArchive = {
    year: 2021, topCode: 208_000, source: 'MSA_M2021_dl.xlsx',
    areas: { '12420': 'Austin-Round Rock, TX' },
    metros: {
      '12420': {
        '11-3021': { p50: 180_000, emp: 110, capped: [] },
        '15-1252': { p50: 145_000, emp: 110, capped: ['p90'] },
        '15-1221': { p50: 208_000, emp: 110, capped: ['p50', 'p90'] },
      },
    },
  }
  const archive2022: MsaArchive = {
    year: 2022, topCode: 239_200, source: 'MSA_M2022_dl.xlsx',
    areas: { '12420': 'Austin-Round Rock, TX' },
    metros: {
      '12420': {
        '11-3021': { p50: 195_000, emp: 120, capped: [] },
        '15-1252': { p50: 150_000, emp: 120, capped: [] },
        '15-1221': { p50: 239_200, emp: 120, capped: ['p50', 'p90'] },
      },
    },
  }
  const archives = [archive2020, archive2021, archive2022]

  it('(a) nulls the value and flags only the vintage that was actually p50-capped', () => {
    const t = buildMetroTrend('12420', archives, cpi3, 2022, del)
    expect(t).not.toBeNull()
    const r = t!.roles['11-3021']
    expect(r.capped).toEqual([true, false, false])
    expect(r.nominal).toEqual([null, 180_000, 195_000])
    expect(r.real[0]).toBeNull()
    // Hand-computed: 180000 * (292.296/269.195) — base year 2022, so 2022 itself is identity.
    expect(r.real[1]).toBeCloseTo(195446.72, 1)
    expect(r.real[2]).toBe(195_000)
  })

  it('(b) a p90-only capped cell is never flagged and its median is never nulled', () => {
    const t = buildMetroTrend('12420', archives, cpi3, 2022, del)
    const r = t!.roles['15-1252']
    expect(r.capped).toEqual([false, false, false])
    expect(r.nominal).toEqual([140_000, 145_000, 150_000])
    // Hand-computed: v * (292.296/cpi[year])
    expect(r.real[0]).toBeCloseTo(159603.73, 1)
    expect(r.real[1]).toBeCloseTo(157443.19, 1)
    expect(r.real[2]).toBe(150_000)
  })

  it('(c) a role absent from every vintage is omitted entirely', () => {
    const t = buildMetroTrend('12420', archives, cpi3, 2022, del)
    expect(t!.roles['15-2051']).toBeUndefined()
  })

  it('(d) a role censored in every vintage is still emitted: present, all-null, all-true flags', () => {
    const t = buildMetroTrend('12420', archives, cpi3, 2022, del)
    const r = t!.roles['15-1221']
    expect(r).toBeDefined()
    expect(r.capped).toEqual([true, true, true])
    expect(r.nominal).toEqual([null, null, null])
    expect(r.real).toEqual([null, null, null])
  })

  it('carries each vintage\'s own top code at the trend level', () => {
    const t = buildMetroTrend('12420', archives, cpi3, 2022, del)
    expect(t!.topCodes).toEqual([208_000, 208_000, 239_200])
  })
})
