import type { MetroTrendData } from './metro-trend-types'

export interface TrendPoint { year: number; value: number }

/** One role's series split into runs that may legitimately be connected by a line.
 *
 *  Two things break a run, and both mean "do not draw across this":
 *   - a null value — OEWS suppressed the figure for a small sample, so we do not know it;
 *   - a delineation break — OMB moved the metro's boundary, so the two sides are different places.
 *
 *  A single-point run is preserved rather than dropped, so the caller can render it as a dot; a
 *  year of real data should not vanish because its neighbours are missing. */
export function segments(trend: MetroTrendData, soc: string, mode: 'real' | 'nominal' = 'real'): TrendPoint[][] {
  const role = trend.roles[soc]
  if (!role) return []
  const values = mode === 'nominal' ? role.nominal : role.real
  // breaks carry {year, from, to}; only the year matters for splitting.
  const breakYears = new Set(trend.breaks.map(b => b.year))

  const out: TrendPoint[][] = []
  let run: TrendPoint[] = []
  trend.years.forEach((year, i) => {
    const v = values[i]
    if (v === null) { if (run.length) out.push(run); run = []; return }
    if (breakYears.has(year) && run.length) { out.push(run); run = [] }
    run.push({ year, value: v })
  })
  if (run.length) out.push(run)
  return out
}
