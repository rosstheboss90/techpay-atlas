import { describe, expect, it } from 'vitest'
import { lastPublishedYear, segments } from '../lib/metro-trend'
import type { MetroTrendData } from '../lib/metro-trend-types'

const brk = (year: number) => ({ year, from: 'Old Name, TX', to: 'New Name, TX' })

const t = (
  nominal: (number | null)[],
  breaks: { year: number; from: string; to: string }[] = [],
  capped?: boolean[],
): MetroTrendData => ({
  cbsa: '12420', name: 'Austin, TX',
  years: [2019, 2020, 2021, 2022, 2023],
  breaks,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2023 },
  // Real per-vintage OEWS top code (pipeline/vintages.ts): $208,000 through 2021, $239,200 from
  // the May 2022 boundary onward.
  topCodes: [208000, 208000, 208000, 239200, 239200],
  roles: { '15-1252': { nominal, real: nominal, capped: capped ?? nominal.map(() => false) } },
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

describe('lastPublishedYear', () => {
  it('reads the last year with a real value when nothing is censored', () => {
    // Fully-absent trailing run: 2022 and 2023 were never published at all — unchanged from the
    // old "last real value" behavior.
    expect(lastPublishedYear(t([1, 2, 3, null, null]), '15-1252')).toBe(2021)
  })

  it('counts a censored (capped) year as published, not absent', () => {
    // Fully-capped trailing run: 2022 and 2023 both carry a null value but capped=true — BLS
    // published them, then top-coded them. The last published year must reach the newest year.
    expect(lastPublishedYear(t([1, 2, 3, null, null], [], [false, false, false, true, true]), '15-1252')).toBe(2023)
  })

  it('stops at the last censored year when a later year is genuinely absent', () => {
    // Mixed trailing run: 2022 is capped (published, then censored); 2023 has no data at all.
    expect(lastPublishedYear(t([1, 2, 3, null, null], [], [false, false, false, true, false]), '15-1252')).toBe(2022)
  })

  it('returns null for a role this metro never published', () => {
    expect(lastPublishedYear(t([1, 2, 3, 4, 5]), '99-9999')).toBeNull()
  })
})
