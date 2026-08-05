'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FilterBar } from '../components/FilterBar'
import { HeadToHead } from '../components/HeadToHead'
import { MetroPanel } from '../components/MetroPanel'
import { RankSlopegraph } from '../components/RankSlopegraph'
import { RoleHeatmap } from '../components/RoleHeatmap'
import { SalaryMap } from '../components/SalaryMap'
import { TitleLens } from '../components/TitleLens'
import { loadMeta, loadSalaries } from '../lib/data'
import type { Meta, Salaries } from '../lib/types'
import { DEFAULT_STATE, parseState, serializeState, type UrlState } from '../lib/url-state'

export default function Page() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [salaries, setSalaries] = useState<Salaries | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<UrlState>(DEFAULT_STATE)
  const [dark, setDark] = useState(false)

  useEffect(() => {
    Promise.all([loadMeta(), loadSalaries()])
      .then(([m, s]) => {
        setMeta(m); setSalaries(s)
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

  return (
    <main className="page">
      <header className="masthead">
        <h1>TechPay Atlas</h1>
        <p className="tagline">
          {role.label} pay across {meta.metros.length} US metros — BLS OEWS {meta.year}
          {state.adjusted ? `, adjusted for cost of living (BEA RPP ${meta.rppYear})` : ''}
        </p>
      </header>
      <FilterBar roles={meta.roles} state={state} onChange={update} />
      <div className={state.metro ? 'hero-row has-panel' : 'hero-row'}>
        <SalaryMap meta={meta} salaries={salaries} soc={state.role} metric={state.metric}
                   adjusted={state.adjusted} selected={state.metro} dark={dark}
                   onSelect={cbsa => update({ metro: cbsa })} />
        {state.metro && (
          <MetroPanel meta={meta} salaries={salaries} cbsa={state.metro} soc={state.role}
                      adjusted={state.adjusted} onClose={() => update({ metro: null })} />
        )}
      </div>
      <RankSlopegraph meta={meta} salaries={salaries} soc={state.role} metric={state.metric}
                      onSelect={cbsa => update({ metro: cbsa })} />
      <HeadToHead meta={meta} salaries={salaries} soc={state.role} adjusted={state.adjusted}
                  metroA={metroA} metroB={metroB} onSelect={p => update(p)} />
      <TitleLens meta={meta} cbsa={state.metro} adjusted={state.adjusted}
                 onSelectRole={soc => update({ role: soc })} />
      <RoleHeatmap meta={meta} salaries={salaries} metric={state.metric} adjusted={state.adjusted}
                   dark={dark} selectedMetro={state.metro} selectedRole={state.role}
                   onSelect={p => update(p)} />
      <footer className="provenance">
        Sources: BLS OEWS {meta.year} · BEA RPP {meta.rppYear} · DOL H-1B LCA {meta.lcaPeriod} · generated {meta.generated.slice(0, 10)}
      </footer>
    </main>
  )
}
