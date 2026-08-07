'use client'
import { pathPoints, valueDomain, type ValueMode } from '../lib/trends'
import type { TrendsJson } from '../lib/trends-types'

const W = 1000, H = 420, PAD_L = 64, PAD_R = 16, PAD_T = 16, PAD_B = 36

/** Median pay over each role's full available history, on a shared axis. `mode` picks which
 *  dollar figure is plotted — 'real' (base-year dollars, comparable across years, the default)
 *  or 'nominal' (the amount actually reported that year, recognizable but not comparable). The
 *  two modes use different y-domains (valueDomain per-mode), not just different point values, so
 *  switching mode reflows every line, not only the highlighted one.
 *
 *  The left edge is deliberately ragged: eight roles have no separate BLS code before 2021, so
 *  their lines start there. That is a classification fact, not a pay fact, and the break marker
 *  says so. Drawing them from the axis origin would invent data.
 *
 *  The selected role is drawn last (after every ghosted role) so it paints on top regardless of
 *  the roles' key order in the source JSON.
 *
 *  viewBox scales to the container — no fixed pixel canvas (repo sizing rule). */
export function TrendsPath({ trends, selected, mode = 'real' }: {
  trends: TrendsJson
  selected: string
  mode?: ValueMode
}) {
  const years = trends.years
  const [lo, hi] = valueDomain(trends, mode)
  const span = Math.max(1, years[years.length - 1] - years[0])
  const x = (year: number) => PAD_L + ((year - years[0]) / span) * (W - PAD_L - PAD_R)
  const y = (v: number) => PAD_T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - PAD_T - PAD_B)

  const socs = Object.keys(trends.roles)
  const ordered = [...socs.filter(s => s !== selected), ...socs.filter(s => s === selected)]
  const sel = trends.roles[selected]

  return (
    <figure className="tr-path">
      <figcaption className="t-caption">
        {mode === 'nominal' ? (
          <>
            Nominal median pay — the dollar amount actually reported that year
            {sel ? <>, <b>{sel.label}</b> highlighted</> : null}. These are the amounts actually
            reported, not restated in {trends.deflator.base} dollars, so they are not comparable
            year to year.
          </>
        ) : (
          <>
            Median pay in {trends.deflator.base} dollars{sel ? <> — <b>{sel.label}</b> highlighted</> : null}.
            Restated using CPI-U ({trends.deflator.period}-to-{trends.deflator.period}).
          </>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={mode === 'nominal' ? 'Nominal median pay over time by role' : 'Real median pay over time by role'}
           className="tr-svg">
        {trends.breaks.map(b => (
          <line key={b.year} data-break x1={x(b.year)} x2={x(b.year)} y1={PAD_T} y2={H - PAD_B} className="tr-break" />
        ))}
        {ordered.map(soc => {
          const pts = pathPoints(trends, soc, mode)
          if (pts.length === 0) return null
          return (
            <polyline
              key={soc}
              data-series={soc}
              data-highlighted={soc === selected}
              className={soc === selected ? 'tr-line tr-line-sel' : 'tr-line tr-line-ghost'}
              points={pts.map(p => `${x(p.year)},${y(p.value)}`).join(' ')}
              fill="none"
            />
          )
        })}
        {years.map(yr => (
          <text key={yr} x={x(yr)} y={H - 10} textAnchor="middle" className="tr-tick">{yr}</text>
        ))}
      </svg>
      {trends.breaks.map(b => (
        <p key={b.year} className="t-note">{b.note}</p>
      ))}
    </figure>
  )
}
