'use client'
import Link from 'next/link'
import type { TrendsJson } from '../lib/trends-types'
import { trendTeaser } from '../lib/teasers'

/** §6 of the question spine: one computed line + the on-ramp to /trends, role carried
 *  across (same param shape MetroTrend already links with). Renders with a fallback line
 *  and no link when trends.json failed to load — the section degrades, never the page. */
export function TrendsTeaser({ trends, soc, roleLabel }: {
  trends: TrendsJson | null; soc: string; roleLabel: string
}) {
  const teaser = trendTeaser(trends, soc)
  return (
    <section className="trend-teaser" aria-labelledby="trend-h">
      <h2 id="trend-h">Is it holding up?</h2>
      <p>
        {roleLabel}: {teaser.fact}{teaser.context ? ` ${teaser.context}` : ''}.{' '}
        {trends != null && <Link href={`/trends?role=${soc}`}>Every role, {trends.years[0]}–{trends.years[trends.years.length - 1]} →</Link>}
      </p>
    </section>
  )
}
