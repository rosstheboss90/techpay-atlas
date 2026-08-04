import type { Pct, SalaryRow } from '../lib/types'
import { adjust } from '../lib/derive'
import { fmtUsd } from '../lib/format'

interface Props { row: SalaryRow; rpp: number | null; adjusted: boolean; domain: [number, number]; width?: number }

/** 10th–90th band, 25th–75th emphasized, median tick. Null-safe: renders nothing it can't place. */
export function PercentileBand({ row, rpp, adjusted, domain, width = 160 }: Props) {
  const h = 14
  const x = (v: number) => Math.max(0, Math.min(width, ((v - domain[0]) / (domain[1] - domain[0] || 1)) * width))
  const val = (p: Pct) => adjust(row[p], rpp, adjusted)
  const [p10, p25, p50, p75, p90] = (['p10', 'p25', 'p50', 'p75', 'p90'] as Pct[]).map(val)
  const label = p10 != null && p90 != null
    ? `10th to 90th percentile: ${fmtUsd(p10)} to ${fmtUsd(p90)}`
    : 'pay range not available'
  return (
    <svg width={width} height={h} className="pct-band" role="img" aria-label={label}>
      {p10 != null && p90 != null && <rect x={x(p10)} y={5} width={x(p90) - x(p10)} height={4} rx={2} className="band-outer" />}
      {p25 != null && p75 != null && <rect x={x(p25)} y={3} width={x(p75) - x(p25)} height={8} rx={3} className="band-inner" />}
      {p50 != null && <line x1={x(p50)} x2={x(p50)} y1={0} y2={h} className="band-median" />}
    </svg>
  )
}
