'use client'
import Link from 'next/link'
import type { TrendsJson } from '../lib/trends-types'
import { trendTeaser } from '../lib/teasers'
import { MiniSpark } from './MiniSpark'

/** §6 of the question spine: the shape of the real-terms series, one computed line, and the
 *  on-ramp to /trends with the role carried across (same param shape MetroTrend already links
 *  with). Renders with a fallback line and no link when trends.json failed to load — the
 *  section degrades, never the page. MiniSpark sets its own aria-hidden; the sentence carries
 *  the claim.
 *
 *  The sparkline was narrow-only when it landed, purely to hold the "desktop must not change"
 *  constraint of that branch. It is not a phone-specific idea: measured on the deployed desktop
 *  page, this section was **50px** tall against neighbours of 660–911px — a heading, a sentence
 *  and a link, the only section on the page carrying no data ink at all. It renders wherever
 *  there is a series to draw; the two viewports differ only in CSS sizing. */
export function TrendsTeaser({ trends, soc, roleLabel }: {
  trends: TrendsJson | null; soc: string; roleLabel: string
}) {
  const teaser = trendTeaser(trends, soc, roleLabel)
  const series = trends?.roles[soc]?.real
  return (
    <section className="trend-teaser" aria-labelledby="trend-h">
      <h2 id="trend-h">Are wages beating inflation?</h2>
      {series != null && <div className="tt-spark"><MiniSpark series={series} /></div>}
      <p>
        {teaser.fact}{' '}
        {trends != null && <Link href={`/trends?role=${soc}`}>Every role, {trends.years[0]}–{trends.years[trends.years.length - 1]} →</Link>}
      </p>
    </section>
  )
}
