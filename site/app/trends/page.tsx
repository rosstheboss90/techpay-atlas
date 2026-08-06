'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TrendsPath } from '../../components/TrendsPath'
import { TrendsRanked } from '../../components/TrendsRanked'
import { loadTrends } from '../../lib/data'
import type { TrendsJson } from '../../lib/trends-types'
import { DEFAULT_STATE, parseState } from '../../lib/url-state'

export default function TrendsPage() {
  const [trends, setTrends] = useState<TrendsJson | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string>(DEFAULT_STATE.role)

  useEffect(() => {
    loadTrends()
      .then(t => {
        setTrends(t)
        const parsed = parseState(new URLSearchParams(window.location.search))
        // parseState only validates the role's shape (##-####), not that it's a role this
        // dataset actually has — the URL is user-controlled, so fall back to a real one.
        const fallback = Object.keys(t.roles)[0]
        setSelected(t.roles[parsed.role] ? parsed.role : fallback)
      })
      .catch(e => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!trends) return
    // Preserve any query params this app doesn't own (utm_*, etc.) — only the
    // role key we manage gets replaced, mirroring app/page.tsx.
    const params = new URLSearchParams(window.location.search)
    params.delete('role')
    if (selected !== DEFAULT_STATE.role) params.set('role', selected)
    const q = params.toString()
    window.history.replaceState(null, '', q ? `?${q}` : window.location.pathname)
  }, [selected, trends])

  if (error) return <main className="page"><p className="load-error">Failed to load data: {error}</p></main>
  if (!trends) return <main className="page"><p className="loading">Loading…</p></main>

  const roleCount = Object.keys(trends.roles).length

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1 className="t-h1">Pay trends</h1>
          <p className="t-lede">
            How real median pay moved across {roleCount} tech occupations, {trends.headlineFrom}–{trends.headlineTo},
            adjusted for inflation. Click a role in either figure to follow it through both.
          </p>
        </div>
        <Link href="/" className="masthead-link">← TechPay Atlas</Link>
      </header>

      <TrendsRanked trends={trends} selected={selected} onSelect={setSelected} />

      <p className="t-note">
        These figures start in {trends.headlineFrom}, a year that ran especially high for pay — not a neutral
        starting line. See "How to read this" below before drawing conclusions from the size of a bar.
      </p>

      <TrendsPath trends={trends} selected={selected} />

      {trends.skippedRoles.length > 0 && (
        <p className="t-note">
          Excluded from these figures for insufficient data: {trends.skippedRoles.join(', ')}.
        </p>
      )}

      <section className="t-method">
        <h2 className="t-h2">How to read this</h2>
        <p>
          The Bureau of Labor Statistics itself cautions against comparing OEWS estimates directly across years —
          methodology and sampling change from one release to the next, and these figures inherit that caveat.
        </p>
        <p>
          The {trends.headlineFrom} baseline is hot. It is the earliest year all {roleCount} occupations exist as
          separate BLS codes, so the headline window has to start there — but {trends.headlineFrom} was also an
          unusually strong year for pay, so every change here is measured from a high starting point.
        </p>
        <p>
          A median can move because the mix inside an occupation shifted — more senior titles, a different industry
          split — rather than because anyone actually got a raise. Occupation mix moves medians independent of pay.
        </p>
        <p>
          A role that first appears in {trends.headlineFrom} is not a new job. It means the BLS started counting it
          separately that year, not that the work began then — earlier years simply folded it into a combined code.
        </p>
        <p>
          Dollar figures are deflated with {trends.deflator.series} (CPI-U, all items, US city average),{' '}
          {trends.deflator.period}-to-{trends.deflator.period}, the same reference month as the underlying wage data
          so no interpolation is needed.
        </p>
        <Link href="/">← Back to the atlas</Link>
      </section>
    </main>
  )
}
