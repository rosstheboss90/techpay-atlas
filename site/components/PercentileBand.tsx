import type { Pct, SalaryRow } from '../lib/types'
import { adjust } from '../lib/derive'
import { fmtUsd } from '../lib/format'

interface Props {
  row: SalaryRow; rpp: number | null; adjusted: boolean; domain: [number, number]
  width?: number
  /** Optional reference value (e.g. a target salary), drawn as a vertical marker when in-domain. */
  marker?: number | null
}

/** 10th–90th band, 25th–75th emphasized, median tick. Null-safe: renders nothing it can't place. */
export function PercentileBand({ row, rpp, adjusted, domain, width = 160, marker = null }: Props) {
  const h = 14
  const x = (v: number) => Math.max(0, Math.min(width, ((v - domain[0]) / (domain[1] - domain[0] || 1)) * width))
  const val = (p: Pct) => adjust(row[p], rpp, adjusted)
  const isCapped = (p: Pct) => row.capped?.includes(p) ?? false
  const [p10, p25, p50, p75, p90] = (['p10', 'p25', 'p50', 'p75', 'p90'] as Pct[]).map(val)
  const baseLabel = p10 != null && p90 != null
    ? `10th to 90th percentile: ${fmtUsd(p10)} to ${fmtUsd(p90)}`
    : 'pay range not available'
  // A capped p50 is a floor, not a true median position, so it gets a declared bound instead
  // of a tick. A capped p90 keeps its bound (the outer rect still IS information) but declares
  // it too, reusing the '≥'/"above" honesty idiom from displayPct / RankSlopegraph.
  const captions: string[] = []
  if (p50 != null && isCapped('p50')) captions.push(`median censored above ${fmtUsd(p50)}`)
  if (p90 != null && isCapped('p90')) captions.push(`top earners above ${fmtUsd(p90)}`)
  const label = captions.length ? `${baseLabel}, ${captions.join(', ')}` : baseLabel
  const showMarker = marker != null && marker >= domain[0] && marker <= domain[1]
  // p10 shares the outer rect with p90 (one rect spans both), so band-capped applies if
  // EITHER end is capped -- same for p25/p75 sharing the inner rect. That's acceptable: the
  // rect visually spans the whole capped/uncapped pair, not just one endpoint.
  const outerCapped = isCapped('p10') || isCapped('p90')
  const innerCapped = isCapped('p25') || isCapped('p75')
  return (
    <svg width={width} height={h} className="pct-band" role="img" aria-label={label}>
      {p10 != null && p90 != null && <rect x={x(p10)} y={5} width={x(p90) - x(p10)} height={4} rx={2} className={outerCapped ? 'band-outer band-capped' : 'band-outer'} />}
      {p25 != null && p75 != null && <rect x={x(p25)} y={3} width={x(p75) - x(p25)} height={8} rx={3} className={innerCapped ? 'band-inner band-capped' : 'band-inner'} />}
      {p50 != null && !isCapped('p50') && <line x1={x(p50)} x2={x(p50)} y1={0} y2={h} className="band-median" />}
      {showMarker && <line x1={x(marker!)} x2={x(marker!)} y1={0} y2={h} className="pct-marker" />}
    </svg>
  )
}
