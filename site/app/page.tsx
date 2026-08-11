'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FilterBar } from '../components/FilterBar'
import { HeadToHead } from '../components/HeadToHead'
import { MetroPanel } from '../components/MetroPanel'
import { MiniSpark } from '../components/MiniSpark'
import { PercentileBand } from '../components/PercentileBand'
import { QuestionSection } from '../components/QuestionSection'
import { RankSlopegraph } from '../components/RankSlopegraph'
import { RoleHeatmap } from '../components/RoleHeatmap'
import { RoleSimilarity } from '../components/RoleSimilarity'
import { SalaryMap } from '../components/SalaryMap'
import { SectionNav } from '../components/SectionNav'
import { TitleLens } from '../components/TitleLens'
import { TitleStrip } from '../components/TitleStrip'
import { TrendsTeaser } from '../components/TrendsTeaser'
import { sharedBandDomain } from '../lib/compare'
import { loadMeta, loadSalaries, loadTitles, loadTrends } from '../lib/data'
import { fmtUsdCompact } from '../lib/format'
import { colTeaser, payTeaser, similarTeaser, titleTeaser, trendTeaser } from '../lib/teasers'
import type { Meta, Salaries } from '../lib/types'
import type { TitlesJson } from '../lib/title-types'
import type { TrendsJson } from '../lib/trends-types'
import { useNarrow } from '../lib/use-narrow'
import { DEFAULT_STATE, parseState, serializeState, type UrlState } from '../lib/url-state'

export default function Page() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [salaries, setSalaries] = useState<Salaries | null>(null)
  // National trends, loaded once here rather than inside MetroPanel — MetroTrend's "national"
  // ghost line needs it on every metro selection, and re-fetching trends.json each time a metro
  // is clicked would be wasteful when it is one small file shared by every metro.
  const [trends, setTrends] = useState<TrendsJson | null>(null)
  // titles is additive context for the tl-h card's dynamic fact (Amendment v2.1) — TitleStrip
  // (desktop-only as of this amendment) loads titles.json itself too, but get() memoizes per
  // URL so the two loads dedupe into one fetch. Best-effort like trends: a failed load leaves
  // the tl-h card on its fallback sentence rather than taking the page down.
  const [titles, setTitles] = useState<TitlesJson | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<UrlState>(DEFAULT_STATE)
  const [dark, setDark] = useState(false)
  const narrow = useNarrow()

  useEffect(() => {
    // trends/titles are additive context (the MetroTrend ghost line + the /trends teaser, and
    // the tl-h card's dynamic fact), not core to the page — a failed fetch must not take the
    // whole page down with it, so both are best-effort here and stay null on failure rather
    // than rejecting the Promise.all.
    Promise.all([loadMeta(), loadSalaries(), loadTrends().catch(() => null), loadTitles().catch(() => null)])
      .then(([m, s, t, ti]) => {
        setMeta(m); setSalaries(s); setTrends(t); setTitles(ti)
        const parsed = parseState(new URLSearchParams(window.location.search))
        setState({
          ...parsed,
          role: m.roles.some(r => r.soc === parsed.role) ? parsed.role : DEFAULT_STATE.role,
          metro: parsed.metro != null && m.metros.some(x => x.cbsa === parsed.metro) ? parsed.metro : null,
          vs: parsed.vs != null && m.metros.some(x => x.cbsa === parsed.vs) ? parsed.vs : null,
        })
      })
      .catch(e => setError(String(e)))
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setDark(mq.matches)
    const fn = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  const update = useCallback((patch: Partial<UrlState>) => {
    setState(prev => ({ ...prev, ...patch }))
  }, [])

  // Desktop hash deep-link: scroll once after the tree exists. Narrow viewports skip this —
  // QuestionSection expands + scrolls its own card (matchMedia is read directly because the
  // narrow STATE hasn't settled on the first post-load render).
  useEffect(() => {
    if (!meta) return
    const hash = window.location.hash.slice(1)
    if (!hash || window.matchMedia('(max-width: 720px)').matches) return
    document.getElementById(hash)?.scrollIntoView?.()
  }, [meta])

  useEffect(() => {
    if (!meta) return
    // Preserve any query params this app doesn't own (utm_*, etc.) — only
    // our own keys get replaced by the serialized state.
    const params = new URLSearchParams(window.location.search)
    for (const key of ['role', 'metric', 'adj', 'metro', 'vs']) params.delete(key)
    for (const [k, v] of new URLSearchParams(serializeState(state))) params.set(k, v)
    const q = params.toString()
    window.history.replaceState(null, '', q ? `?${q}` : window.location.pathname)
  }, [state, meta])

  const role = useMemo(() => meta?.roles.find(r => r.soc === state.role) ?? null, [meta, state.role])

  // Default head-to-head pair: the two top-paying metros for the current role.
  const comparePair = useMemo<[string, string]>(() => {
    if (!meta || !salaries) return ['', '']
    const ranked = meta.metros
      .map(m => ({ cbsa: m.cbsa, v: salaries[m.cbsa]?.[state.role]?.p50 ?? null }))
      .filter((x): x is { cbsa: string; v: number } => x.v != null)
      .sort((a, b) => b.v - a.v)
    return [ranked[0]?.cbsa ?? meta.metros[0]?.cbsa ?? '', ranked[1]?.cbsa ?? '']
  }, [meta, salaries, state.role])

  if (error) return <main className="page"><p className="load-error">Failed to load data: {error}</p></main>
  if (!meta || !salaries || !role) return <main className="page"><p className="loading">Loading…</p></main>

  const metroA = state.metro ?? comparePair[0]
  const metroB = state.vs ?? (comparePair[0] && comparePair[0] !== metroA ? comparePair[0] : comparePair[1])

  const hash = window.location.hash.slice(1)
  const cardIds = ['sec-map', 'h2h-h', 'slope-h', 'trend-h', 'tl-h', 'rsim-h', 'hm-heading']
  const openId = cardIds.includes(hash) ? hash : null

  const teasers = {
    pay: payTeaser(salaries, meta.metros, state.role),
    col: colTeaser(meta.metros, salaries, state.role, state.metric),
    trend: trendTeaser(trends, state.role, role.label),
    title: titleTeaser(titles, state.role, role.label),
    similar: similarTeaser(meta, salaries, state.role),
  }
  // Mini-viz nodes for cards with real data-ink (spec: per-card mapping). Decorative — the card
  // text carries the claim — and built only from existing primitives/tokens.
  const rowA = salaries[metroA]?.[state.role]
  const rppA = meta.metros.find(m => m.cbsa === metroA)?.rpp ?? null
  const payViz = teasers.pay.top3.length > 0 && (
    <span className="qcard-chips">
      {teasers.pay.top3.map(t => (
        <span key={t.city} className="qcard-chip"><b>{fmtUsdCompact(t.p50)}</b> {t.city}</span>
      ))}
    </span>
  )
  const bandViz = rowA != null && (
    <PercentileBand row={rowA} rpp={rppA} adjusted={state.adjusted}
                    domain={sharedBandDomain(rowA, undefined, rppA, null, state.adjusted)} width={220} />
  )
  const sparkSeries = trends?.roles[state.role]?.real
  const sparkViz = sparkSeries != null && sparkSeries.filter(v => v != null).length >= 2 && <MiniSpark series={sparkSeries} />
  const similarViz = teasers.similar.topLabel != null && (
    <span className="qcard-chips">
      <span className="qcard-chip">{teasers.similar.topLabel}</span>
      {teasers.similar.count > 1 && <span className="qcard-chip">+{teasers.similar.count - 1} more</span>}
    </span>
  )

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1>TechPay Atlas</h1>
          <p className="value">Check what your job really pays — by city, by real job title, adjusted for what living there costs.</p>
          <p className="thesis">Official data tells you the number. This tells you what the number leaves out.</p>
          <p className="tagline tagline-small">
            {role.label} · {meta.metros.length} metros · BLS OEWS {meta.year}
            {state.adjusted ? `, adjusted for cost of living (BEA RPP ${meta.rppYear})` : ''}
          </p>
        </div>
        <Link href="/about" className="masthead-link">About the data →</Link>
        <Link href="/trends" className="masthead-link">Pay over time →</Link>
        <Link href="/employers" className="masthead-link">Employers →</Link>
      </header>
      {!narrow && <SectionNav />}
      <FilterBar roles={meta.roles} state={state} onChange={update} />
      {!narrow && <TitleStrip soc={state.role} roleLabel={role.label} />}
      <QuestionSection anchorId="sec-map" question="Where does it pay the most?"
                       fact={teasers.pay.fact} context="" viz={payViz || undefined}
                       narrow={narrow} initialOpen={openId === 'sec-map'}>
        <h2 className="sec-q">Where does it pay the most?</h2>
        <div id="sec-map" className={state.metro ? 'hero-row has-panel' : 'hero-row'}>
          <SalaryMap meta={meta} salaries={salaries} soc={state.role} metric={state.metric}
                     adjusted={state.adjusted} selected={state.metro} dark={dark}
                     onSelect={cbsa => update({ metro: cbsa })} />
          {state.metro && (
            <MetroPanel meta={meta} salaries={salaries} cbsa={state.metro} soc={state.role}
                        adjusted={state.adjusted} national={trends} onClose={() => update({ metro: null })} />
          )}
        </div>
      </QuestionSection>
      <QuestionSection anchorId="h2h-h" question="Are you underpaid?"
                       fact={`Type your offer to see where it lands, in any two of ${meta.metros.length} metros.`}
                       context="" viz={bandViz || undefined}
                       narrow={narrow} initialOpen={openId === 'h2h-h'}>
        <HeadToHead meta={meta} salaries={salaries} soc={state.role} adjusted={state.adjusted}
                    metroA={metroA} metroB={metroB} onSelect={p => update(p)} />
      </QuestionSection>
      <QuestionSection anchorId="slope-h" question="Does your salary go far there?"
                       fact={teasers.col.fact} context=""
                       narrow={narrow} initialOpen={openId === 'slope-h'}>
        <RankSlopegraph meta={meta} salaries={salaries} soc={state.role} metric={state.metric}
                        onSelect={cbsa => update({ metro: cbsa })} />
      </QuestionSection>
      <QuestionSection anchorId="trend-h" question="Are wages beating inflation?"
                       fact={teasers.trend.fact} context="" viz={sparkViz || undefined}
                       narrow={narrow} initialOpen={openId === 'trend-h'}>
        <TrendsTeaser trends={trends} soc={state.role} roleLabel={role.label} />
      </QuestionSection>
      <QuestionSection anchorId="tl-h" question="What's this job really called?"
                       fact={teasers.title.fact} context=""
                       narrow={narrow} initialOpen={openId === 'tl-h'}>
        <TitleLens meta={meta} cbsa={state.metro} adjusted={state.adjusted}
                   onSelectRole={soc => update({ role: soc })} />
      </QuestionSection>
      <QuestionSection anchorId="rsim-h" question="What else could you be?"
                       fact={teasers.similar.fact} context="" viz={similarViz || undefined}
                       narrow={narrow} initialOpen={openId === 'rsim-h'}>
        <RoleSimilarity meta={meta} salaries={salaries} soc={state.role}
                        onSelectRole={soc => update({ role: soc })} />
      </QuestionSection>
      <QuestionSection anchorId="hm-heading" question="How does it all compare?"
                       fact="Every metro and every role, in one grid." context=""
                       narrow={narrow} initialOpen={openId === 'hm-heading'}>
        <RoleHeatmap meta={meta} salaries={salaries} metric={state.metric} adjusted={state.adjusted}
                     dark={dark} selectedMetro={state.metro} selectedRole={state.role}
                     onSelect={p => update(p)} />
      </QuestionSection>
      <footer className="provenance">
        Sources: BLS OEWS {meta.year} · BEA RPP {meta.rppYear} · DOL H-1B LCA {meta.lcaPeriod} · generated {meta.generated.slice(0, 10)}
      </footer>
    </main>
  )
}
