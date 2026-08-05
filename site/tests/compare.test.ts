import { describe, expect, it } from 'vitest'
import type { EmployerBundle, SalaryRow } from '../lib/types'
import { beeswarmAxisMax, pctForSalary, sharedBandDomain } from '../lib/compare'

const row = (over: Partial<SalaryRow> = {}): SalaryRow =>
  ({ emp: 100, lq: 1, p10: 100_000, p25: 120_000, p50: 150_000, p75: 180_000, p90: 220_000, ...over })

describe('pctForSalary', () => {
  const r = row()
  it('returns the exact percentile at a knot', () => {
    expect(pctForSalary(r, 150_000, null, false)).toEqual({ kind: 'in', pct: 50 })
    expect(pctForSalary(r, 100_000, null, false)).toEqual({ kind: 'in', pct: 10 })
  })
  it('interpolates linearly between knots', () => {
    // halfway between p25 (120k) and p50 (150k) -> pct 37 or 38 (midpoint of 25 and 50)
    expect(pctForSalary(r, 135_000, null, false)).toEqual({ kind: 'in', pct: 38 })
  })
  it('reports below/above outside p10–p90 (no fabricated tail)', () => {
    expect(pctForSalary(r, 80_000, null, false)).toEqual({ kind: 'below' })
    expect(pctForSalary(r, 250_000, null, false)).toEqual({ kind: 'above' })
  })
  it('respects COL adjustment', () => {
    // rpp 150 -> p50 150k becomes 100k adjusted; a 100k target now lands at the 50th
    expect(pctForSalary(r, 100_000, 150, true)).toEqual({ kind: 'in', pct: 50 })
  })
  it('is null with fewer than two knots', () => {
    expect(pctForSalary(row({ p10: null, p25: null, p50: 150_000, p75: null, p90: null }), 150_000, null, false)).toBeNull()
  })
})

describe('sharedBandDomain', () => {
  it('spans min p10 to max p90 across both metros', () => {
    const a = row({ p10: 100_000, p90: 200_000 })
    const b = row({ p10: 90_000, p90: 240_000 })
    expect(sharedBandDomain(a, b, null, null, false)).toEqual([90_000, 240_000])
  })
  it('falls back to [0,1] when neither row is placeable', () => {
    expect(sharedBandDomain(undefined, undefined, null, null, false)).toEqual([0, 1])
  })
})

describe('beeswarmAxisMax', () => {
  const bundle = (p99: number): EmployerBundle => ({ employers: [], sample: [], n: 10, p99 })
  it('takes the larger adjusted p99', () => {
    expect(beeswarmAxisMax(bundle(300_000), bundle(260_000), null, null, false)).toBe(300_000)
  })
  it('excludes a metro that cannot be adjusted (rpp null in adjusted mode)', () => {
    // A rpp null -> drops out; B rpp 100 -> 260k
    expect(beeswarmAxisMax(bundle(300_000), bundle(260_000), null, 100, true)).toBe(260_000)
  })
})
