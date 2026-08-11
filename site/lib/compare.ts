import type { EmployerBundle, Pct, SalaryRow } from './types'
import { adjust } from './derive'

const PCTS: [Pct, number][] = [['p10', 10], ['p25', 25], ['p50', 50], ['p75', 75], ['p90', 90]]

export type PctResult = { kind: 'below' } | { kind: 'above' } | { kind: 'in'; pct: number }

/**
 * Estimated percentile for a salary within a row's p10–p90, piecewise-linear over the five known
 * knots. The salary is a nominal dollar figure in this metro, so in adjusted mode it is rescaled
 * with the knots — a percentile is invariant under COL adjustment, and comparing a raw salary to
 * adjusted knots would overstate its standing. `below`/`above` when the salary sits outside
 * p10–p90 — we don't extrapolate a fabricated tail. Null when the row has fewer than two
 * placeable knots (or the salary itself can't be adjusted).
 */
export function pctForSalary(row: SalaryRow, salary: number, rpp: number | null, adjusted: boolean): PctResult | null {
  const s = adjust(salary, rpp, adjusted)
  if (s == null) return null
  const knots = PCTS
    .map(([p, pct]) => ({ pct, v: adjust(row[p], rpp, adjusted) }))
    .filter((k): k is { pct: number; v: number } => k.v != null)
  if (knots.length < 2) return null
  const lo = knots[0], hi = knots[knots.length - 1]
  if (s < lo.v) return { kind: 'below' }
  if (s > hi.v) return { kind: 'above' }
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i], b = knots[i + 1]
    if (s >= a.v && s <= b.v) {
      const t = b.v === a.v ? 0 : (s - a.v) / (b.v - a.v)
      return { kind: 'in', pct: Math.round(a.pct + t * (b.pct - a.pct)) }
    }
  }
  return { kind: 'in', pct: hi.pct }
}

/** [min p10, max p90] across both rows (COL-adjusted per metro) — the shared band scale. */
export function sharedBandDomain(
  rowA: SalaryRow | undefined, rowB: SalaryRow | undefined,
  rppA: number | null, rppB: number | null, adjusted: boolean,
): [number, number] {
  const vals: number[] = []
  for (const [row, rpp] of [[rowA, rppA], [rowB, rppB]] as const) {
    if (!row) continue
    const lo = adjust(row.p10, rpp, adjusted)
    const hi = adjust(row.p90, rpp, adjusted)
    if (lo != null) vals.push(lo)
    if (hi != null) vals.push(hi)
  }
  return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1]
}

/** Max COL-adjusted p99 across both employer bundles — the shared beeswarm axis top. A metro that
 *  can't be adjusted (rpp null in adjusted mode) drops out. Fallback 1. */
export function beeswarmAxisMax(
  bundleA: EmployerBundle | undefined, bundleB: EmployerBundle | undefined,
  rppA: number | null, rppB: number | null, adjusted: boolean,
): number {
  const maxes: number[] = []
  for (const [bundle, rpp] of [[bundleA, rppA], [bundleB, rppB]] as const) {
    if (!bundle) continue
    const v = adjust(bundle.p99, rpp, adjusted)
    if (v != null) maxes.push(v)
  }
  return maxes.length ? Math.max(...maxes) : 1
}
