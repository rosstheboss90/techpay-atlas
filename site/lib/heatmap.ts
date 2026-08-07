import type { MetroMeta, Metric, Salaries } from './types'
import { metricValue } from './derive'
import { fmtNum, fmtUsdCompact } from './format'

/** Sum of employment across all roles for a metro (null cells skipped). */
export function totalEmployment(salaries: Salaries, cbsa: string): number {
  const roles = salaries[cbsa]
  if (!roles) return 0
  let sum = 0
  for (const soc in roles) {
    const e = roles[soc]?.emp
    if (e != null) sum += e
  }
  return sum
}

/** The n metros with the largest total employment, descending; deterministic tie-break by cbsa. */
export function topMetrosByEmployment(metros: MetroMeta[], salaries: Salaries, n: number): MetroMeta[] {
  return [...metros]
    .map(m => ({ m, emp: totalEmployment(salaries, m.cbsa) }))
    .sort((a, b) => b.emp - a.emp || a.m.cbsa.localeCompare(b.m.cbsa))
    .slice(0, n)
    .map(x => x.m)
}

/**
 * [min, max] of one role's cell values across the given metros under the active metric — the color
 * domain for that column. Suppressed cells (and, in adjusted-pay mode, rpp-null metros) are absent
 * from `metricValue` and excluded. Null when the column has no values. Per-column by design: S1's
 * domain never sees S2's values, so color stays comparable down a column, not across.
 */
export function columnDomain(
  metros: MetroMeta[], salaries: Salaries, soc: string, metric: Metric, adjusted: boolean,
): [number, number] | null {
  let lo = Infinity, hi = -Infinity
  for (const m of metros) {
    const v = metricValue(salaries[m.cbsa]?.[soc], m, metric, adjusted)
    if (v == null) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return hi === -Infinity ? null : [lo, hi]
}

/**
 * Compact "min–max" label for a column's domain, formatted for the active metric so it reads
 * naturally beside the printed cell values (compact currency for pay, plain counts for
 * employment, two decimals for location quotient).
 *
 * Callers MUST pass the exact domain `columnDomain` produced for that column's colors — never
 * recompute the range independently. If the label and the shading were derived separately they
 * could silently drift apart, and a wrong range is worse than no range. A null domain (no visible
 * metro has a value in this column) gets an explicit "no data" label rather than rendering blank
 * or `$NaN–$NaN`.
 */
export function formatColumnRange(domain: [number, number] | null, metric: Metric): string {
  if (domain == null) return 'no data'
  const [lo, hi] = domain
  if (metric === 'pay') return `${fmtUsdCompact(lo)}–${fmtUsdCompact(hi)}`
  if (metric === 'emp') return `${fmtNum(lo)}–${fmtNum(hi)}`
  return `${lo.toFixed(2)}–${hi.toFixed(2)}`
}

/**
 * Legible ink (near-black / near-white) for text laid over a hex cell background. The sequential
 * ramps span light→dark, so no single text color works across a column — pick by perceived
 * luminance. Non-hex input (shouldn't happen for colored cells) falls back to dark ink.
 */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#0c1016'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.6 ? '#0c1016' : '#f2f5f8'
}

/**
 * Order metros by one role's metric value. Nulls (suppressed / unadjustable) always sort last in
 * BOTH directions — they are "no data", not "lowest". Stable tie-break by metro name.
 */
export function sortMetros(
  metros: MetroMeta[], salaries: Salaries, sortSoc: string, metric: Metric, adjusted: boolean,
  dir: 'asc' | 'desc',
): MetroMeta[] {
  const val = (m: MetroMeta) => metricValue(salaries[m.cbsa]?.[sortSoc], m, metric, adjusted)
  return [...metros].sort((a, b) => {
    const va = val(a), vb = val(b)
    if (va == null && vb == null) return a.name.localeCompare(b.name)
    if (va == null) return 1
    if (vb == null) return -1
    if (va !== vb) return dir === 'desc' ? vb - va : va - vb
    return a.name.localeCompare(b.name)
  })
}
