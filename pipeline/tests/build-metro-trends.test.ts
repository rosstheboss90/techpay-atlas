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

  it('marks a censored cell without altering the plotted median', () => {
    const a = v(2021, 120730)
    a.metros['12420']['15-1252'].capped = ['p90']
    const t = buildMetroTrend('12420', [a, v(2025, 135980)], cpi, 2025, del)
    expect(t).not.toBeNull()
    expect(t!.roles['15-1252'].capped).toEqual([true, false])
    expect(t!.roles['15-1252'].nominal[0]).toBe(120730)
  })

  it('throws when a year has no CPI value rather than silently dropping it', () => {
    expect(() => buildMetroTrend('12420', [v(2021, 1)], { 2025: 321.465 }, 2025, del))
      .toThrow(/no CPI value for 2021/)
  })

  it('returns null for a metro absent from every vintage', () => {
    expect(buildMetroTrend('99999', [v(2021, 1)], cpi, 2025, del)).toBeNull()
  })
})
