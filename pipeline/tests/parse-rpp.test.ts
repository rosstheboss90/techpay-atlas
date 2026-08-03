import { describe, expect, it } from 'vitest'
import { rppRowsToMap } from '../lib/parse-rpp'

// One "All items" (LineCode 1) row per metro. cbsa numbers are made up but 5-digit/real-looking.
const metroRow = (cbsa: string, values: Record<string, string>) => ({
  GeoFIPS: `"${cbsa}"`, GeoName: `Metro ${cbsa}`, LineCode: '1', Description: 'RPPs: All items', ...values,
})
const goodsRow = (cbsa: string, values: Record<string, string>) => ({
  GeoFIPS: `"${cbsa}"`, GeoName: `Metro ${cbsa}`, LineCode: '2', Description: 'RPPs: Goods', ...values,
})
const usRow = (values: Record<string, string>) => ({
  GeoFIPS: '"00998"', GeoName: 'United States (Metropolitan Portion)', LineCode: '1', Description: 'RPPs: All items', ...values,
})

describe('rppRowsToMap', () => {
  it('keeps only All-items lines and real CBSAs (aggregate/goods lines dropped)', () => {
    const rows = [
      metroRow('10001', { '2023': '104.1' }),
      goodsRow('10001', { '2023': '99.0' }),
      usRow({ '2023': '100.4' }),
    ]
    const { values } = rppRowsToMap(rows)
    expect(values.get('10001')).toBe(104.1)
    expect(values.has('00998')).toBe(false)
    expect(values.size).toBe(1)
  })

  it('picks the single latest year whose non-null coverage is >= 90% of the best year, and a metro NA in that chosen year is absent (no per-row fallback)', () => {
    // 10 metros, all present in 2022 (count 10, the best year). In 2023, 9/10 have a value
    // (exactly the 90% bar) and metro 10010 is NA -- so 2023 clears the bar and is chosen,
    // but metro 10010 must NOT fall back to its 2022 value; it's simply absent.
    const rows: Record<string, string>[] = []
    for (let i = 1; i <= 10; i++) {
      const cbsa = `100${String(i).padStart(2, '0')}`
      const values: Record<string, string> = { '2022': `${100 + i}.0` }
      values['2023'] = i === 10 ? '(NA)' : `${90 + i}.0`
      rows.push(metroRow(cbsa, values))
    }
    const { year, values } = rppRowsToMap(rows)
    expect(year).toBe(2023)
    expect(values.get('10001')).toBe(91.0) // 2023 value, not 2022's 101.0
    expect(values.has('10010')).toBe(false) // NA in the chosen year 2023 -- absent, not backfilled from 2022
    expect(values.size).toBe(9)
  })

  it('falls back to the prior year globally when the latest year is too sparse (< 90% of the best year)', () => {
    // 10 metros, all present in 2022 (count 10, the best year). 2023 only has 1/10 (10%,
    // far under the 90% bar), so the latest-year candidate is rejected and 2022 (the best
    // year) is used for every metro instead -- including the one metro that DOES have a
    // (now-ignored) 2023 value.
    const rows: Record<string, string>[] = []
    for (let i = 1; i <= 10; i++) {
      const cbsa = `200${String(i).padStart(2, '0')}`
      const values: Record<string, string> = { '2022': `${100 + i}.0` }
      values['2023'] = i === 1 ? '95.0' : '(NA)'
      rows.push(metroRow(cbsa, values))
    }
    const { year, values } = rppRowsToMap(rows)
    expect(year).toBe(2022)
    expect(values.get('20001')).toBe(101.0) // 2022 value, NOT the sparse-year 95.0
    expect(values.size).toBe(10)
  })

  it('trims quoted GeoFIPS', () => {
    const { values } = rppRowsToMap([metroRow('12420', { '2023': '103.6' })])
    expect(values.get('12420')).toBe(103.6)
  })
})
