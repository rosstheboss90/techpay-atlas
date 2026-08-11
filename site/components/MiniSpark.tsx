'use client'

const W = 120, H = 22, PAD = 2

/** Decorative sparkline for a question card: the shape of a series, nothing more. The card's
 *  TEXT carries the claim (honesty rule), so this is aria-hidden; nulls draw as gaps, matching
 *  the full trend charts. Stroke reuses the trends line token (--accent) — no new colors. */
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
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="mini-spark">
      {runs.filter(r => r.length > 1).map(r => (
        <polyline key={r[0].i} points={r.map(p => `${x(p.i)},${y(p.v)}`).join(' ')} fill="none" />
      ))}
      <circle cx={x(lastIdx)} cy={y(last)} r={2.5} />
    </svg>
  )
}
