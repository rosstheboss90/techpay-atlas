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
  const PCTS: Pct[] = ['p10', 'p25', 'p50', 'p75', 'p90']
  const [p10, p25, p50, p75, p90] = PCTS.map(val)
  const vals: Record<Pct, number | null> = { p10, p25, p50, p75, p90 }
  const baseLabel = p10 != null && p90 != null
    ? `10th to 90th percentile: ${fmtUsd(p10)} to ${fmtUsd(p90)}`
    : null
  // A capped p50 is a floor, not a true median position, so it gets a declared bound instead
  // of a tick. A capped p90 keeps its bound (the outer rect still IS information) but declares
  // it too -- this extends the '≥' honesty idiom (displayPct/RankSlopegraph) into prose for aria.
  // p10/p25/p75 get the same per-edge treatment: the visual band-capped class over-claims the
  // whole shared rect (outer: p10+p90, inner: p25+p75), so the aria names the exact capped edge
  // instead. Captions follow PCTS order so the composed label is deterministic.
  const captions: string[] = []
  for (const p of PCTS) {
    const v = vals[p]
    if (v == null || !isCapped(p)) continue
    if (p === 'p50') captions.push(`median censored above ${fmtUsd(v)}`)
    else if (p === 'p90') captions.push(`top earners above ${fmtUsd(v)}`)
    else captions.push(`${p} censored above ${fmtUsd(v)}`)
  }
  // If we have neither a base range nor any capped-edge caption, fall back to the "not
  // available" message. Never prefix "not available" onto a caption we ARE stating -- that
  // reads as contradictory ("range not available, median censored above $X").
  const label = baseLabel != null
    ? (captions.length ? `${baseLabel}, ${captions.join(', ')}` : baseLabel)
    : (captions.length ? captions.join(', ') : 'pay range not available')
  const showMarker = marker != null && marker >= domain[0] && marker <= domain[1]
  // p10 shares the outer rect with p90 (one rect spans both), so band-capped applies if
  // EITHER end is capped -- same for p25/p75 sharing the inner rect. The visual class
  // over-claims the whole span; the aria label above names the exact capped edge instead.
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
