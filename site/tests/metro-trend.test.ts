import { describe, expect, it } from 'vitest'
import { segments } from '../lib/metro-trend'
import type { MetroTrendData } from '../lib/metro-trend-types'

const brk = (year: number) => ({ year, from: 'Old Name, TX', to: 'New Name, TX' })

const t = (nominal: (number | null)[], breaks: { year: number; from: string; to: string }[] = []): MetroTrendData => ({
  cbsa: '12420', name: 'Austin, TX',
  years: [2019, 2020, 2021, 2022, 2023],
  breaks,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2023 },
  // Real per-vintage OEWS top code (pipeline/vintages.ts): $208,000 through 2021, $239,200 from
  // the May 2022 boundary onward.
  topCodes: [208000, 208000, 208000, 239200, 239200],
  roles: { '15-1252': { nominal, real: nominal, capped: nominal.map(() => false) } },
})

describe('segments', () => {
  it('returns one segment for an unbroken series', () => {
    const s = segments(t([1, 2, 3, 4, 5]), '15-1252')
    expect(s).toHaveLength(1)
    expect(s[0].map(p => p.year)).toEqual([2019, 2020, 2021, 2022, 2023])
  })

  it('splits at a suppression gap rather than drawing across it', () => {
    const s = segments(t([1, 2, null, 4, 5]), '15-1252')
    expect(s).toHaveLength(2)
    expect(s[0].map(p => p.year)).toEqual([2019, 2020])
    expect(s[1].map(p => p.year)).toEqual([2022, 2023])
  })

  it('splits at a delineation break even when values are continuous', () => {
    // The data is present on both sides; the geography changed, so the line must not connect.
    const s = segments(t([1, 2, 3, 4, 5], [brk(2022)]), '15-1252')
    expect(s).toHaveLength(2)
    expect(s[0].map(p => p.year)).toEqual([2019, 2020, 2021])
    expect(s[1].map(p => p.year)).toEqual([2022, 2023])
  })

  it('drops leading nulls so a late-starting series begins where its data does', () => {
    const s = segments(t([null, null, 3, 4, 5]), '15-1252')
    expect(s).toHaveLength(1)
    expect(s[0][0].year).toBe(2021)
  })

  it('keeps a lone point as its own segment so it can be drawn as a dot', () => {
    const s = segments(t([1, null, 3, null, 5]), '15-1252')
    expect(s).toHaveLength(3)
    expect(s.every(seg => seg.length === 1)).toBe(true)
  })

  it('returns nothing for a role this metro never published', () => {
    expect(segments(t([1, 2, 3]), '99-9999')).toEqual([])
  })

  it('reads real values, not nominal, by default', () => {
    const trend = t([100, 200, 300, 400, 500])
    trend.roles['15-1252'].real = [1, 2, 3, 4, 5]
    expect(segments(trend, '15-1252')[0][0].value).toBe(1)
  })
})
