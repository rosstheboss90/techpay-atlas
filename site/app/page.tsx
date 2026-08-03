'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FilterBar } from '../components/FilterBar'
import { loadMeta, loadSalaries } from '../lib/data'
import type { Meta, Salaries } from '../lib/types'
import { DEFAULT_STATE, parseState, serializeState, type UrlState } from '../lib/url-state'

export default function Page() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [salaries, setSalaries] = useState<Salaries | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<UrlState>(DEFAULT_STATE)

  useEffect(() => {
    Promise.all([loadMeta(), loadSalaries()])
      .then(([m, s]) => {
        setMeta(m); setSalaries(s)
        const parsed = parseState(new URLSearchParams(window.location.search))
        setState(m.roles.some(r => r.soc === parsed.role) ? parsed : { ...parsed, role: DEFAULT_STATE.role })
      })
      .catch(e => setError(String(e)))
  }, [])

  const update = useCallback((patch: Partial<UrlState>) => {
    setState(prev => {
      const next = { ...prev, ...patch }
      const q = serializeState(next)
      window.history.replaceState(null, '', q ? `?${q}` : window.location.pathname)
      return next
    })
  }, [])

  const role = useMemo(() => meta?.roles.find(r => r.soc === state.role) ?? null, [meta, state.role])

  if (error) return <main className="page"><p className="load-error">Failed to load data: {error}</p></main>
  if (!meta || !salaries || !role) return <main className="page"><p className="loading">Loading…</p></main>

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
      {/* Task 5 mounts <SalaryMap/> here; Task 6 mounts <MetroPanel/> */}
      <footer className="provenance">
        Sources: BLS OEWS {meta.year} · BEA RPP {meta.rppYear} · DOL H-1B LCA {meta.lcaPeriod} · generated {meta.generated.slice(0, 10)}
      </footer>
    </main>
  )
}
