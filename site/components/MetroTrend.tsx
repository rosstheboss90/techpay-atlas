'use client'
import { pathPoints } from '../lib/trends'
import { segments } from '../lib/metro-trend'
import type { MetroTrendData } from '../lib/metro-trend-types'
import type { TrendsJson } from '../lib/trends-types'

const W = 440, H = 200, PAD_L = 52, PAD_R = 12, PAD_T = 10, PAD_B = 24

/** "Pay over time" for one metro, drawn below "Pay by role" in MetroPanel.
 *
 *  Deliberately takes NO cost-of-living prop. The panel's cost-of-living control reads a spatial
 *  BEA index, renormalised to US = 100 every year; the trend below reads CPI-U instead, a temporal
 *  index. The two must never share a code path. The guard is structural, not a runtime check: a
 *  prop that does not exist in this signature cannot be wired in by a future refactor, and a test
 *  scans this component's own source text to confirm neither the panel's prop name nor the
 *  spatial index's abbreviation appears here at all. See "The trap this design exists to avoid" in
 *  the Phase B design spec.
 *
 *  Idiom mirrors TrendsPath.tsx: viewBox scales to the container (no fixed pixel canvas, house
 *  rule), one polyline per segment, the non-highlighted series drawn ghosted.
 *
 *  Sizing note for whoever does Task 9 (styles): this viewBox is a first guess sized for a narrow
 *  side panel (440x200, versus TrendsPath's full-width 1000x420). It has not been checked against
 *  the actual rendered panel — confirm it doesn't read as cramped or, if scaled up by CSS,
 *  uncomfortably tall, and adjust the ratio (not just the CSS) if so. */
export function MetroTrend({ metro, national, soc, roleLabel }: {
  metro: MetroTrendData
  national: TrendsJson
  soc: string
  roleLabel: string
}) {
  const role = metro.roles[soc]
  if (!role) {
    return <p className="panel-note">{roleLabel} was not published for {metro.name} in this dataset.</p>
  }

  const metroSegments = segments(metro, soc)
  const nonNullYears = metro.years.filter((_, i) => role.real[i] !== null)
  const yearCount = nonNullYears.length
  const lastDataYear = nonNullYears[nonNullYears.length - 1] ?? null
  const newestYear = metro.years[metro.years.length - 1]
  const endsEarly = lastDataYear != null && lastDataYear < newestYear

  const nationalPoints = pathPoints(national, soc)

  // Shared y-domain across both series, so the metro line and the ghosted national line are
  // visually comparable rather than each auto-scaling to its own range.
  const allValues = [
    ...metroSegments.flatMap(seg => seg.map(p => p.value)),
    ...nationalPoints.map(p => p.value),
  ]
  const lo = allValues.length ? Math.min(...allValues) : 0
  const hi = allValues.length ? Math.max(...allValues) : 1

  // Shared x-domain: the union of both series' year ranges, not just the metro's — the national
  // series can run longer than any one metro's published history.
  const allYears = [...metro.years, ...national.years]
  const yearLo = Math.min(...allYears)
  const yearHi = Math.max(...allYears)
  const span = Math.max(1, yearHi - yearLo)
  const x = (year: number) => PAD_L + ((year - yearLo) / span) * (W - PAD_L - PAD_R)
  const y = (v: number) => PAD_T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - PAD_T - PAD_B)

  const breakYears = metro.breaks.map(b => b.year)

  return (
    <div className="mt-trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${roleLabel} pay over time for ${metro.name}, versus the national figure`}
           className="mt-svg">
        {metro.breaks.map(b => (
          <line key={b.year} data-break x1={x(b.year)} x2={x(b.year)} y1={PAD_T} y2={H - PAD_B} className="mt-break" />
        ))}
        {nationalPoints.length > 0 && (
          <polyline data-national-series
                    className="mt-line mt-national"
                    points={nationalPoints.map(p => `${x(p.year)},${y(p.value)}`).join(' ')}
                    fill="none" />
        )}
        {metroSegments.map(seg => (
          seg.length === 1
            ? <circle key={seg[0].year} data-metro-series className="mt-point"
                      cx={x(seg[0].year)} cy={y(seg[0].value)} r={3.5} />
            : <polyline key={seg[0].year} data-metro-series className="mt-line"
                        points={seg.map(p => `${x(p.year)},${y(p.value)}`).join(' ')}
                        fill="none" />
        ))}
      </svg>
      <p className="mt-legend">
        <span className="mt-legend-metro">{metro.name}</span> vs <span className="mt-legend-national">National</span>
      </p>
      <p className="panel-note">
        Figures use CPI-U inflation only, expressed in {metro.deflator.base} dollars — this is not
        cost-of-living: the toggle above does not change these numbers.
      </p>
      {metro.breaks.length > 0 && (
        <p className="panel-note">
          Metro boundary changed in {breakYears.join(', ')}: {metro.breaks.map(b => `${b.from} → ${b.to}`).join('; ')}.
          The line is broken there rather than connected across it — this is detected from a change
          in the metro's published name (it was redefined), not a direct read of the boundary itself.
        </p>
      )}
      {endsEarly && (
        <p className="panel-note">No data published for this metro after {lastDataYear}.</p>
      )}
      {yearCount < 3 && (
        <p className="panel-note">Only {yearCount} year{yearCount === 1 ? '' : 's'} of published data — not a trend.</p>
      )}
    </div>
  )
}
