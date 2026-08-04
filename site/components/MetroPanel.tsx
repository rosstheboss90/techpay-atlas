'use client'
import { useEffect, useMemo, useState } from 'react'
import type { EmployerFile, Meta, Pct, Salaries } from '../lib/types'
import { adjust, displayPct, rankMetros } from '../lib/derive'
import { fmtNum, fmtUsd } from '../lib/format'
import { loadEmployers } from '../lib/data'
import { PercentileBand } from './PercentileBand'

interface Props {
  meta: Meta; salaries: Salaries; cbsa: string; soc: string; adjusted: boolean
  onClose: () => void
}

export function MetroPanel({ meta, salaries, cbsa, soc, adjusted, onClose }: Props) {
  const metro = meta.metros.find(m => m.cbsa === cbsa)
  const [employers, setEmployers] = useState<EmployerFile | null>(null)
  const [empError, setEmpError] = useState(false)

  useEffect(() => {
    setEmployers(null); setEmpError(false)
    if (!metro || metro.lcaFilings === 0) return
    let live = true
    loadEmployers(cbsa).then(e => { if (live) setEmployers(e) }).catch(() => { if (live) setEmpError(true) })
    return () => { live = false }
  }, [cbsa, metro])

  const ranks = useMemo(() => rankMetros(meta.metros, salaries, soc, 'pay', adjusted), [meta, salaries, soc, adjusted])
  // Band domain shared across the role table so rows are comparable within the metro.
  const domain = useMemo<[number, number]>(() => {
    const vals = meta.roles.flatMap(r => {
      const row = salaries[cbsa]?.[r.soc]
      return row ? (['p10', 'p90'] as Pct[]).map(p => adjust(row[p], metro?.rpp ?? null, adjusted)).filter((v): v is number => v != null) : []
    })
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1]
  }, [meta, salaries, cbsa, adjusted, metro])

  if (!metro) return null
  const row = salaries[cbsa]?.[soc]
  const role = meta.roles.find(r => r.soc === soc)
  const median = row ? adjust(row.p50, metro.rpp, adjusted) : null
  const bundle = employers?.roles[soc]

  return (
    <aside className="metro-panel" aria-label={`${metro.name} details`}>
      <header className="panel-head">
        <h2>{metro.name}</h2>
        <button type="button" className="panel-close" onClick={onClose} aria-label="Close panel">×</button>
      </header>

      {adjusted && metro.rpp == null ? (
        <p className="panel-note">Puerto Rico metros have no cost-of-living index (BEA RPP) — showing nominal figures only.</p>
      ) : null}

      <dl className="headline-stats">
        <div><dt>{role?.short} median{adjusted ? ' (adj.)' : ''}</dt><dd>{row ? displayPct(row, 'p50', metro.rpp, adjusted) : '—'}</dd></div>
        <div><dt>National rank</dt><dd>{median != null && ranks.get(cbsa) ? `#${ranks.get(cbsa)}` : '—'}</dd></div>
        <div><dt>{role?.short} jobs</dt><dd>{fmtNum(row?.emp)}</dd></div>
        <div><dt>H-1B filings (all roles)</dt><dd>{fmtNum(metro.lcaFilings)}</dd></div>
      </dl>

      <h3 className="panel-sub">Pay by role</h3>
      <table className="role-table">
        <thead><tr><th scope="col">Role</th><th scope="col">10th–90th percentile</th><th scope="col">Median</th></tr></thead>
        <tbody>
          {meta.roles.map(r => {
            const rr = salaries[cbsa]?.[r.soc]
            if (!rr) return null
            return (
              <tr key={r.soc} className={r.soc === soc ? 'is-current' : ''}>
                <th scope="row">{r.short}</th>
                <td><PercentileBand row={rr} rpp={metro.rpp} adjusted={adjusted} domain={domain} /></td>
                <td className="cell-num">{displayPct(rr, 'p50', metro.rpp, adjusted)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h3 className="panel-sub">Who actually pays what — H-1B filings, {meta.lcaPeriod}</h3>
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
          <ol className="employer-list">
            {bundle.employers.slice(0, 10).map(e => (
              <li key={e.name}>
                <span className="employer-name">{e.name}</span>
                <span className="employer-facts">{fmtUsd(adjust(e.median, metro.rpp, adjusted))} · {e.filings} filings</span>
              </li>
            ))}
          </ol>
          {bundle.n <= 2 && <p className="panel-note">Small sample ({bundle.n} filings) — treat medians as anecdotes.</p>}
        </>
      )}
    </aside>
  )
}
