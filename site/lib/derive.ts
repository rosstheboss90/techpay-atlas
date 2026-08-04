import type { Metric, MetroMeta, Pct, Salaries, SalaryRow } from './types'
import { fmtUsd } from './format'

/** COL-adjust a dollar value. Adjusting with unknown rpp is impossible -> null. */
export function adjust(value: number | null, rpp: number | null, adjusted: boolean): number | null {
  if (value == null) return null
  if (!adjusted) return value
  if (rpp == null) return null
  return value / (rpp / 100)
}

/** The number the map/rankings encode for a metro under the current controls. */
export function metricValue(row: SalaryRow | undefined, metro: MetroMeta, metric: Metric, adjusted: boolean): number | null {
  if (!row) return null
  if (metric === 'pay') return adjust(row.p50, metro.rpp, adjusted)
  if (metric === 'emp') return row.emp
  return row.lq
}

/** 1-based ordinal ranking by metric desc (no shared ranks on ties); metros with null metric are absent from the map. */
export function rankMetros(metros: MetroMeta[], salaries: Salaries, soc: string, metric: Metric, adjusted: boolean): Map<string, number> {
  const scored = metros
    .map(m => ({ cbsa: m.cbsa, v: metricValue(salaries[m.cbsa]?.[soc], m, metric, adjusted) }))
    .filter((x): x is { cbsa: string; v: number } => x.v != null)
    .sort((a, b) => b.v - a.v)
  return new Map(scored.map((x, i) => [x.cbsa, i + 1]))
}

/** Render one percentile: '≥ $X' when capped, em-dash when null. */
export function displayPct(row: SalaryRow, pct: Pct, rpp: number | null, adjusted: boolean): string {
  const v = adjust(row[pct], rpp, adjusted)
  if (v == null) return '—'
  const s = fmtUsd(Math.round(v))
  return row.capped?.includes(pct) ? `≥ ${s}` : s
}
