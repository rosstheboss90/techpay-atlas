'use client'
import { useMemo, useState } from 'react'
import type { Meta, Metric, MetroMeta, Salaries, SalaryRow } from '../lib/types'
import { displayPct, metricValue } from '../lib/derive'
import { RAMP_DARK, RAMP_LIGHT, bubbleColor } from '../lib/map-scales'
import { fmtNum } from '../lib/format'
import { columnDomain, inkOn, sortMetros, topMetrosByEmployment } from '../lib/heatmap'

interface Props {
  meta: Meta
  salaries: Salaries
  metric: Metric
  adjusted: boolean
  dark: boolean
  selectedMetro: string | null
  selectedRole: string
  onSelect: (patch: { metro: string; role: string }) => void
}

const TOP_N = 50

function metricNoun(metric: Metric, adjusted: boolean): string {
  if (metric === 'pay') return adjusted ? 'Median pay, cost-of-living adjusted' : 'Median pay'
  if (metric === 'emp') return 'Employment'
  return 'Location quotient'
}

/** Printed cell value — the source of truth (color is only a secondary encoding). */
function cellText(row: SalaryRow | undefined, m: MetroMeta, metric: Metric, adjusted: boolean): string {
  if (metric === 'pay') return row ? displayPct(row, 'p50', m.rpp, adjusted) : '—'
  if (metric === 'emp') return fmtNum(row?.emp ?? null)
  return row?.lq == null ? '—' : row.lq.toFixed(2)
}

export function RoleHeatmap({ meta, salaries, metric, adjusted, dark, selectedMetro, selectedRole, onSelect }: Props) {
  const [sortSoc, setSortSoc] = useState(selectedRole)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')

  const ramp = dark ? RAMP_DARK : RAMP_LIGHT
  const roles = meta.roles

  // Row set: a search matches across ALL metros (ignoring the top-N cap); otherwise top-N by
  // employment unless "show all" is on. Then ordered by the active sort column.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q
      ? meta.metros.filter(m => m.name.toLowerCase().includes(q))
      : showAll ? meta.metros : topMetrosByEmployment(meta.metros, salaries, TOP_N)
    return sortMetros(pool, salaries, sortSoc, metric, adjusted, sortDir)
  }, [meta.metros, salaries, query, showAll, sortSoc, sortDir, metric, adjusted])

  // One color domain per role column, over the currently-visible rows.
  const domains = useMemo(() => {
    const map = new Map<string, [number, number] | null>()
    for (const r of roles) map.set(r.soc, columnDomain(rows, salaries, r.soc, metric, adjusted))
    return map
  }, [roles, rows, salaries, metric, adjusted])

  const toggleSort = (soc: string) => {
    if (soc === sortSoc) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortSoc(soc); setSortDir('desc') }
  }

  const caption =
    `${metricNoun(metric, adjusted)} by metro and role. Color is scaled within each role column ` +
    `(comparable down a column, not across) — the printed values are the source of truth.`

  return (
    <section className="heatmap" aria-labelledby="hm-heading">
      <header className="hm-head">
        <h2 id="hm-heading">City × role</h2>
        <p className="hm-note">
          {metricNoun(metric, adjusted)} · color scaled within each role column · click a cell to open that metro
        </p>
      </header>

      <div className="hm-controls">
        <input type="search" className="hm-search" placeholder="Filter metros…" value={query}
               aria-label="Filter metros by name" onChange={e => setQuery(e.target.value)} />
        {!query.trim() && (
          <button type="button" className="hm-toggle" aria-pressed={showAll} onClick={() => setShowAll(s => !s)}>
            {showAll ? `Show top ${TOP_N}` : `Show all ${meta.metros.length}`}
          </button>
        )}
        <span className="hm-count">{rows.length} metros</span>
      </div>

      {/* The wrapper carries the right-edge fade that signals the table scrolls
          horizontally — 21 role columns never fit the viewport. */}
      <div className="hm-scrollwrap">
      <div className="hm-scroll">
        <table className="hm-table">
          <caption className="hm-caption">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="hm-corner">Metro</th>
              {roles.map(r => {
                const active = r.soc === sortSoc
                return (
                  <th key={r.soc} scope="col" className={`hm-colh${r.soc === selectedRole ? ' is-selcol' : ''}`}
                      aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}>
                    <button type="button" className="hm-sort" title={`Sort by ${r.label}`}
                            onClick={() => toggleSort(r.soc)}>
                      {r.short}{active ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td className="hm-empty" colSpan={roles.length + 1}>No metros match “{query.trim()}”.</td></tr>
            ) : rows.map(m => (
              <tr key={m.cbsa} className={m.cbsa === selectedMetro ? 'is-selrow' : undefined}>
                <th scope="row" className="hm-rowh" title={m.name}>{m.name.split(',')[0]}</th>
                {roles.map(r => {
                  const row = salaries[m.cbsa]?.[r.soc]
                  const v = metricValue(row, m, metric, adjusted)
                  const selcol = r.soc === selectedRole
                  if (v == null) {
                    const reason = metric === 'pay' && adjusted && m.rpp == null && row
                      ? 'no cost-of-living index' : 'no data'
                    return (
                      <td key={r.soc} className={`hm-cell hm-cell--empty${selcol ? ' is-selcol' : ''}`}
                          aria-label={`${m.name}, ${r.label}: ${reason}`}>—</td>
                    )
                  }
                  const dom = (domains.get(r.soc) ?? [v, v]) as [number, number]
                  const fill = bubbleColor(v, dom, ramp)
                  return (
                    <td key={r.soc} className={`hm-cell${selcol ? ' is-selcol' : ''}`}>
                      <button type="button" className="hm-cellbtn"
                              style={{ backgroundColor: fill, color: inkOn(fill) }}
                              aria-label={`${m.name}, ${r.label}: ${cellText(row, m, metric, adjusted)}`}
                              onClick={() => onSelect({ metro: m.cbsa, role: r.soc })}>
                        {cellText(row, m, metric, adjusted)}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </section>
  )
}
