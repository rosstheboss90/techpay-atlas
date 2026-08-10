'use client'
import Link from 'next/link'
import { fmtUsd, fmtUsdCompact } from '../lib/format'
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
 *  scans this component's own source CODE (comments and string/JSX text excluded — see that
 *  test's comment) to confirm neither the panel's prop name nor the spatial index's abbreviation
 *  is ever reached for. See "The trap this design exists to avoid" in the Phase B design spec.
 *
 *  Idiom mirrors TrendsPath.tsx: viewBox scales to the container (no fixed pixel canvas, house
 *  rule), one polyline per segment, the non-highlighted series drawn ghosted.
 *
 *  ⚠️ UNVERIFIED SIZING — read before touching styles (Task 9). This viewBox (440x200, versus
 *  TrendsPath's full-width 1000x420) is a first guess sized for a narrow side panel and has never
 *  been looked at rendered. It is not a measured value — do not assume it was checked. Before
 *  styling, render an actual metro panel with a multi-segment trend and confirm: the chart doesn't
 *  read as cramped at side-panel width, and it doesn't make the panel absurdly tall once CSS gives
 *  it real dimensions. If either is true, change this ratio, not just the CSS scaling it. */
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

  // A censored median is a null point (Task 2), same as a suppressed one — segments() already
  // draws a gap for it. What it must NOT do is read as an absence: the figure was published and
  // then BLS top-coded it, so "no data published" (below) would be false for a trailing censored
  // run. cappedIndices/censoredYears/censoredCeilings are index-aligned with metro.years via
  // topCodes (Task 2's per-vintage ceiling), never a single fixed number.
  const cappedIndices = metro.years.map((_, i) => i).filter(i => role.capped[i])
  const hasCensored = cappedIndices.length > 0
  const censoredYears = cappedIndices.map(i => metro.years[i])
  const censoredCeilings = [...new Set(cappedIndices.map(i => metro.topCodes[i]))]

  // If every year after the last real point is censored (not just missing), the "ends early" note
  // below would misreport a published-then-top-coded figure as never published. Suppress it in
  // that case — the censor note names those years with the true reason instead.
  const trailingAllCapped =
    endsEarly && lastDataYear != null &&
    metro.years.every((year, i) => (lastDataYear as number) >= year || role.capped[i])

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
        {/* Year and value orientation. Without these the chart is a shape with no scale — a
            reader cannot tell WHEN the line rises or WHAT it is worth, which is most of the
            question this section exists to answer. Only the endpoints are labelled: the panel is
            narrow, and a full tick set would crowd a 440-wide viewBox. The break year is named in
            the prose below rather than on the axis, where it would collide with the 2025 label. */}
        {/* Labels come from the PLOTTED domain (yearLo/yearHi, lo/hi), not from metro.years —
            the axis must describe what is actually drawn, and the national series can widen the
            span beyond this metro's own years. */}
        <text x={PAD_L} y={H - 8} textAnchor="start" className="mt-tick">{yearLo}</text>
        <text x={W - PAD_R} y={H - 8} textAnchor="end" className="mt-tick">{yearHi}</text>
        <text x={PAD_L - 6} y={PAD_T + 8} textAnchor="end" className="mt-tick">{fmtUsdCompact(hi)}</text>
        <text x={PAD_L - 6} y={H - PAD_B} textAnchor="end" className="mt-tick">{fmtUsdCompact(lo)}</text>
      </svg>
      <p className="mt-legend">
        <span className="mt-legend-metro">{metro.name}</span> vs <span className="mt-legend-national">National</span>
      </p>
      <p className="panel-note">
        In {metro.deflator.base} dollars (CPI-U) — this is inflation, not cost of living. The
        cost-of-living toggle above does not change these figures.
      </p>
      {metro.breaks.length > 0 && (
        <p className="panel-note">
          Metro boundary changed in {breakYears.join(', ')}: {metro.breaks.map(b => `${b.from} → ${b.to}`).join('; ')}.
          The line is broken there rather than connected across it — this is detected from a change
          in the metro's published name (it was redefined), not a direct read of the boundary itself.
        </p>
      )}
      {hasCensored && (
        <p className="panel-note">
          Median censored above {censoredCeilings.map(fmtUsd).join(' / ')} in {censoredYears.join(', ')} —
          BLS top-codes the highest wages, so those points are omitted rather than plotted as real
          medians.
        </p>
      )}
      {endsEarly && !trailingAllCapped && (
        <p className="panel-note">No data published for this metro after {lastDataYear}.</p>
      )}
      {yearCount < 3 && (
        <p className="panel-note">Only {yearCount} year{yearCount === 1 ? '' : 's'} of published data — not a trend.</p>
      )}
      {/* The on-ramp, not an exit. A reader arrives asking one narrow question about one city;
          having answered it, this offers the more interesting version of the same question. The
          ghosted national line hints that the comparison exists but cannot answer it across every
          occupation — that is what the link is for. Role is carried so the follow-up stays about
          the job they came for. */}
      <p className="panel-note">
        <Link href={`/trends?role=${soc}`}>Is this just here, or everywhere? See every role nationally →</Link>
      </p>
    </div>
  )
}
