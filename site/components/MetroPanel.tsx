'use client'
import { useEffect, useMemo, useState } from 'react'
import type { EmployerFile, Meta, Pct, Salaries } from '../lib/types'
import type { MetroTrendData } from '../lib/metro-trend-types'
import type { TrendsJson } from '../lib/trends-types'
import { adjust, displayPct, rankMetros } from '../lib/derive'
import { fmtNum, fmtUsd } from '../lib/format'
import { loadEmployers, loadMetroTrend } from '../lib/data'
import { MetroTrend } from './MetroTrend'
import { PercentileBand } from './PercentileBand'

interface Props {
  meta: Meta; salaries: Salaries; cbsa: string; soc: string; adjusted: boolean
  national: TrendsJson
  onClose: () => void
}

export function MetroPanel({ meta, salaries, cbsa, soc, adjusted, national, onClose }: Props) {
  const metro = meta.metros.find(m => m.cbsa === cbsa)
  // Adjusting is impossible without an RPP (e.g. Puerto Rico metros) — fall back to
  // nominal figures rather than blanking every number while the note implies they're shown.
  const canAdjust = metro?.rpp != null
  const adj = adjusted && canAdjust
  const [employers, setEmployers] = useState<EmployerFile | null>(null)
  const [empError, setEmpError] = useState(false)
  const [trend, setTrend] = useState<MetroTrendData | null>(null)
  const [trendError, setTrendError] = useState(false)

  useEffect(() => {
    setEmployers(null); setEmpError(false)
    if (!metro || metro.lcaFilings === 0) return
    let live = true
    loadEmployers(cbsa).then(e => { if (live) setEmployers(e) }).catch(() => { if (live) setEmpError(true) })
    return () => { live = false }
  }, [cbsa, metro])

  useEffect(() => {
    setTrend(null); setTrendError(false)
    // Mirrors the employers guard above: skip the fetch entirely when meta says there is
    // nothing there, rather than fetching and discovering a 404.
    if (!metro || (metro.trendYears ?? 0) === 0) return
    let live = true
    loadMetroTrend(cbsa).then(t => { if (live) setTrend(t) }).catch(() => { if (live) setTrendError(true) })
    return () => { live = false }
  }, [cbsa, metro])

  const ranks = useMemo(() => rankMetros(meta.metros, salaries, soc, 'pay', adj), [meta, salaries, soc, adj])
  // Band domain shared across the role table so rows are comparable within the metro.
  const domain = useMemo<[number, number]>(() => {
    const vals = meta.roles.flatMap(r => {
      const row = salaries[cbsa]?.[r.soc]
      return row ? (['p10', 'p90'] as Pct[]).map(p => adjust(row[p], metro?.rpp ?? null, adj)).filter((v): v is number => v != null) : []
    })
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1]
  }, [meta, salaries, cbsa, adj, metro])

  if (!metro) return null
  const row = salaries[cbsa]?.[soc]
  const role = meta.roles.find(r => r.soc === soc)
  const median = row ? adjust(row.p50, metro.rpp, adj) : null
  const bundle = employers?.roles[soc]

  return (
    <aside className="metro-panel" aria-label={`${metro.name} details`}>
      <header className="panel-head">
        <h2>{metro.name}</h2>
        <button type="button" className="panel-close" onClick={onClose} aria-label="Close panel">×</button>
      </header>

      {adjusted && !canAdjust ? (
        <p className="panel-note">Puerto Rico metros have no cost-of-living index (BEA RPP) — showing nominal figures only.</p>
      ) : null}

      <dl className="headline-stats">
        <div><dt>{role?.short} median{adj ? ' (adj.)' : ''}</dt><dd>{row ? displayPct(row, 'p50', metro.rpp, adj) : '—'}</dd></div>
        <div><dt>National rank</dt><dd>{median != null && ranks.get(cbsa) ? `#${ranks.get(cbsa)}` : '—'}</dd></div>
        <div><dt>{role?.short} jobs</dt><dd>{fmtNum(row?.emp)}</dd></div>
        <div><dt>H-1B filings (all roles)</dt><dd>{fmtNum(metro.lcaFilings)}</dd></div>
      </dl>

      <h3 className="panel-sub">Pay by role</h3>
      <table className="role-table">
        <thead><tr><th scope="col">Role</th><th scope="col">10th–90th percentile{adj ? ' (adj.)' : ''}</th><th scope="col">Median{adj ? ' (adj.)' : ''}</th></tr></thead>
        <tbody>
          {meta.roles.map(r => {
            const rr = salaries[cbsa]?.[r.soc]
            if (!rr) return null
            return (
              <tr key={r.soc} className={r.soc === soc ? 'is-current' : ''}>
                <th scope="row">{r.short}</th>
                <td><PercentileBand row={rr} rpp={metro.rpp} adjusted={adj} domain={domain} /></td>
                <td className="cell-num">{displayPct(rr, 'p50', metro.rpp, adj)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* `undefined` and `0` are different facts and must not collapse into one message.
          undefined -> the pipeline never stamped trendYears, so the metro-trend dataset has not
          been emitted at all and the feature is not live. Render nothing: a section claiming "no
          published history" on every one of 393 metros would be false, since the history exists
          and simply has not been built yet.
          0 -> the pipeline DID stamp it and this metro genuinely has no published history. */}
      {metro.trendYears === undefined ? null : (
        <>
          <h3 className="panel-sub">Pay over time — {role?.label}</h3>
          {trendError
            ? <p className="panel-note">Couldn't load trend data — try re-selecting the metro.</p>
            : trend
              ? <MetroTrend metro={trend} national={national} soc={soc} roleLabel={role?.label ?? soc} />
              : metro.trendYears === 0
                ? <p className="panel-note">No published history for this metro.</p>
                : <p className="panel-note">Loading trend…</p>}
        </>
      )}

      <h3 className="panel-sub">Who actually pays what — H-1B filings, {meta.lcaPeriod}{adj ? ' · COL-adjusted' : ''}</h3>
      {metro.lcaFilings === 0 ? (
        <p className="panel-note">No H-1B filings on record for this metro.</p>
      ) : empError ? (
        <p className="panel-note">Couldn't load employer data — try re-selecting the metro.</p>
      ) : !employers ? (
        <p className="panel-note">Loading employers…</p>
      ) : !bundle ? (
        <p className="panel-note">No filings for {role?.label} here — pick another role or metro.</p>
      ) : (
        <>
          <p className="panel-note">top {Math.min(10, bundle.employers.length)} employers · {bundle.n} filings</p>
          <ol className="employer-list">
            {bundle.employers.slice(0, 10).map(e => (
              <li key={e.name}>
                <span className="employer-name">{e.name}</span>
                <span className="employer-facts">{fmtUsd(adjust(e.median, metro.rpp, adj))} · {e.filings} filings</span>
              </li>
            ))}
          </ol>
          {bundle.n <= 2 && <p className="panel-note">Small sample ({bundle.n} filings) — treat medians as anecdotes.</p>}
          <p className="panel-note">Employer medians are midpoints of filed wage ranges — treat as floors, not offers.</p>
        </>
      )}
    </aside>
  )
}
