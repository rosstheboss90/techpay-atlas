'use client'
import Link from 'next/link'
import type { TrendsJson } from '../lib/trends-types'
import { trendTeaser } from '../lib/teasers'
import { MiniSpark } from './MiniSpark'

/** §6 of the question spine: one computed line + the on-ramp to /trends, role carried
 *  across (same param shape MetroTrend already links with). Renders with a fallback line
 *  and no link when trends.json failed to load — the section degrades, never the page.
 *  The sparkline is narrow-only: TrendsTeaser is shared with desktop, and desktop rendering
 *  must not change (Invariant 5), so the shape of the real-terms series only shows up on the
 *  phone page. MiniSpark sets its own aria-hidden — the sentence carries the claim. */
export function TrendsTeaser({ trends, soc, roleLabel, narrow = false }: {
  trends: TrendsJson | null; soc: string; roleLabel: string; narrow?: boolean
}) {
  const teaser = trendTeaser(trends, soc, roleLabel)
  const series = trends?.roles[soc]?.real
  return (
    <section className="trend-teaser" aria-labelledby="trend-h">
      <h2 id="trend-h">Are wages beating inflation?</h2>
      {narrow && series != null && <div className="tt-spark"><MiniSpark series={series} /></div>}
      <p>
        {teaser.fact}{' '}
        {trends != null && <Link href={`/trends?role=${soc}`}>Every role, {trends.years[0]}–{trends.years[trends.years.length - 1]} →</Link>}
      </p>
    </section>
  )
}
