import { describe, expect, it } from 'vitest'
import { buildTrends } from '../lib/build-trends'
import type { NationalArchive } from '../lib/history'

const band = (p50: number) => ({ emp: 100, p10: null, p25: null, p50, p75: null, p90: null, capped: [] })

const archive = (year: number, roles: Record<string, number>): NationalArchive => ({
  year, topCode: 239_200, source: `national_M${year}_dl.xlsx`,
  roles: Object.fromEntries(Object.entries(roles).map(([soc, p50]) => [soc, band(p50)])),
})

// Real CPI-U May values, so the arithmetic in these tests is the arithmetic that ships.
const cpi = { 2019: 256.092, 2020: 256.394, 2021: 269.195, 2022: 292.296, 2023: 304.127, 2024: 314.069, 2025: 321.465 }

describe('buildTrends', () => {
  it('lists years ascending across the archives given', () => {
    const out = buildTrends([archive(2021, { '15-1252': 1 }), archive(2019, { '11-3021': 1 })], cpi, 2025, 2021)
    expect(out.years).toEqual([2019, 2021])
  })

  it('deflates to the base year, leaving the base year nominal', () => {
    const out = buildTrends([archive(2025, { '15-1252': 135980 })], cpi, 2025, 2025)
    const r = out.roles['15-1252']
    expect(r.nominal).toEqual([135980])
    expect(r.real).toEqual([135980])
  })

  it('converts an earlier year into base-year dollars', () => {
    const out = buildTrends([archive(2021, { '15-1252': 120730 }), archive(2025, { '15-1252': 135980 })], cpi, 2025, 2021)
    const r = out.roles['15-1252']
    // 120730 * 321.465 / 269.195 = 144172.32656624378
    expect(r.real[0]).toBeCloseTo(144172.3, 0)
    expect(r.real[1]).toBe(135980)
  })

  it('computes changeReal over the headline window', () => {
    const out = buildTrends([archive(2021, { '15-1252': 120730 }), archive(2025, { '15-1252': 135980 })], cpi, 2025, 2021)
    expect(out.roles['15-1252'].changeReal).toBeCloseTo(-0.0569, 3)
  })

  it('pads a role absent from an early vintage with nulls and records firstYear', () => {
    const out = buildTrends(
      [archive(2019, { '11-3021': 100000 }), archive(2021, { '11-3021': 110000, '15-1252': 120730 })],
      cpi, 2025, 2021)
    const swe = out.roles['15-1252']
    expect(swe.firstYear).toBe(2021)
    expect(swe.nominal).toEqual([null, 120730])
    expect(swe.real[0]).toBeNull()
  })

  it('keeps the full history of a long-running role rather than windowing it', () => {
    const out = buildTrends(
      [archive(2019, { '11-3021': 100000 }), archive(2021, { '11-3021': 110000, '15-1252': 120730 })],
      cpi, 2025, 2021)
    expect(out.roles['11-3021'].firstYear).toBe(2019)
    expect(out.roles['11-3021'].nominal).toEqual([100000, 110000])
  })

  it('marks a censored p90 per year without affecting the plotted p50', () => {
    const a = archive(2021, { '11-3021': 150000 })
    a.roles['11-3021'].p90 = 208_000
    a.roles['11-3021'].capped = ['p90']
    const out = buildTrends([a, archive(2025, { '11-3021': 180000 })], cpi, 2025, 2021)
    expect(out.roles['11-3021'].cappedP90).toEqual([true, false])
    expect(out.roles['11-3021'].nominal).toEqual([150000, 180000])
  })

  it('throws when the headline start year is missing from the archives', () => {
    expect(() => buildTrends([archive(2019, { '11-3021': 1 })], cpi, 2025, 2021))
      .toThrow(/headline start year 2021 is not among the archived vintages/)
  })

  it('throws when a year has no CPI value rather than silently dropping it', () => {
    expect(() => buildTrends([archive(2021, { '15-1252': 1 })], { 2025: 321.465 }, 2025, 2021))
      .toThrow(/no CPI value for 2021/)
  })

  it('throws when a role is missing from the headline start year', () => {
    // Every role must exist at the headline start, or its bar would be uncomparable.
    const out = () => buildTrends(
      [archive(2021, { '11-3021': 1 }), archive(2025, { '11-3021': 2, '15-1252': 3 })], cpi, 2025, 2021)
    expect(out).toThrow(/15-1252 is absent from the headline start year 2021/)
  })
})
