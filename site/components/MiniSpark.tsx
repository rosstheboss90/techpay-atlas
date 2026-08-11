'use client'

const W = 280, H = 30, PAD = 2

/** Decorative sparkline for a question card: the shape of a series, nothing more. The card's
 *  TEXT carries the claim (honesty rule), so this is aria-hidden; nulls draw as gaps and
 *  isolated points as dots, matching the full trend charts. Stroke reuses the trends line token
 *  (--accent) — no new colors. */
export function MiniSpark({ series }: { series: (number | null)[] }) {
  const real = series.filter((v): v is number => v != null)
  if (real.length < 2) return null
  const lo = Math.min(...real), hi = Math.max(...real)
  const x = (i: number) => PAD + (i / (series.length - 1)) * (W - 2 * PAD)
  const y = (v: number) => hi === lo ? H / 2 : PAD + ((hi - v) / (hi - lo)) * (H - 2 * PAD)
  const runs: { i: number; v: number }[][] = []
  series.forEach((v, i) => {
    if (v == null) { if (runs[runs.length - 1]?.length) runs.push([]); return }
    if (!runs.length) runs.push([])
    runs[runs.length - 1].push({ i, v })
  })
  const lastIdx = series.length - 1 - [...series].reverse().findIndex(v => v != null)
  const last = series[lastIdx] as number
  // Dots are drawn as degenerate (near-zero-length) polylines whose round-capped STROKE is the
  // dot, not <circle> — under the card's non-uniform CSS scaling (width: 100% vs a fixed height),
  // a preserveAspectRatio="none" viewBox stretches X and Y by different factors, which would turn
  // a circle's radius into an ellipse. A stroke width is immune to that (vector-effect keeps it
  // constant in screen pixels on both axes), so the dot stays round at every card width.
  const dot = (px: number, py: number) => `${px},${py} ${px + 0.01},${py}`
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="mini-spark">
      {runs.filter(r => r.length > 1).map(r => (
        <polyline key={r[0].i} points={r.map(p => `${x(p.i)},${y(p.v)}`).join(' ')} fill="none"
                  vectorEffect="non-scaling-stroke" />
      ))}
      {runs.filter(r => r.length === 1 && !(r[0].i === lastIdx)).map(r => (
        <polyline key={`pt-${r[0].i}`} points={dot(x(r[0].i), y(r[0].v))} fill="none"
                  strokeLinecap="round" strokeWidth={4} vectorEffect="non-scaling-stroke"
                  className="mini-spark-pt" />
      ))}
      <polyline points={dot(x(lastIdx), y(last))} fill="none"
                strokeLinecap="round" strokeWidth={5} vectorEffect="non-scaling-stroke"
                className="mini-spark-dot" />
    </svg>
  )
}
