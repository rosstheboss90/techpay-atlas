'use client'
import { useMemo, useState } from 'react'
import type { Meta, Metric, MetroMeta, Salaries, SalaryRow } from '../lib/types'
import { displayPct, metricValue } from '../lib/derive'
import { RAMP_DARK, RAMP_LIGHT, bubbleColor } from '../lib/map-scales'
import { fmtNum } from '../lib/format'
import { columnDomain, formatColumnRange, inkOn, sortMetros, topMetrosByEmployment } from '../lib/heatmap'

interface Props {
  meta: Meta
  salaries: Salaries
  metric: Metric
  adjusted: boolean
  dark: boolean
  selectedMetro: string | null
  selectedRole: string
  narrow?: boolean
  onSelect: (patch: { metro: string; role: string }) => void
}

export const TOP_N = 50
export const TOP_N_NARROW = 15

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

export function RoleHeatmap({ meta, salaries, metric, adjusted, dark, selectedMetro, selectedRole, narrow = false, onSelect }: Props) {
  const [sortSoc, setSortSoc] = useState(selectedRole)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')

  const ramp = dark ? RAMP_DARK : RAMP_LIGHT
  const roles = meta.roles
  const cap = narrow ? TOP_N_NARROW : TOP_N

  // Row set: a search matches across ALL metros (ignoring the cap); otherwise top-N by
  // employment (N depends on viewport) unless "show all" is on. Then ordered by the active sort column.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q
      ? meta.metros.filter(m => m.name.toLowerCase().includes(q))
      : showAll ? meta.metros : topMetrosByEmployment(meta.metros, salaries, cap)
    return sortMetros(pool, salaries, sortSoc, metric, adjusted, sortDir)
  }, [meta.metros, salaries, query, showAll, sortSoc, sortDir, metric, adjusted, cap])

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
    `${metricNoun(metric, adjusted)} by metro and role. Color is scaled within each role column, ` +
    `not across — each column header prints that column's own min–max range so the scales' ` +
    `differences are visible rather than assumed; the printed cell values are the source of truth.`

  return (
    <section className="heatmap" aria-labelledby="hm-heading">
      <header className="hm-head">
        <h2 id="hm-heading">How does it all compare?</h2>
        <p className="hm-note">
          {metricNoun(metric, adjusted)} · color scaled within each role column, its range printed under the header
          · click a cell to open that metro
        </p>
      </header>

      <div className="hm-controls">
        <input type="search" className="hm-search" placeholder="Filter metros…" value={query}
               aria-label="Filter metros by name" onChange={e => setQuery(e.target.value)} />
        {!query.trim() && (
          <button type="button" className="hm-toggle" aria-pressed={showAll} onClick={() => setShowAll(s => !s)}>
            {showAll ? `Show top ${cap}` : `Show all ${meta.metros.length}`}
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
                const rangeLabel = formatColumnRange(domains.get(r.soc) ?? null, metric)
                return (
                  <th key={r.soc} scope="col" className={`hm-colh${r.soc === selectedRole ? ' is-selcol' : ''}`}
                      aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}>
                    <button type="button" className="hm-sort" title={`Sort by ${r.label}`}
                            onClick={() => toggleSort(r.soc)}>
                      {r.short}{active ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                    </button>
                    {/* This column's own color-scale range — same domain the cell fills use
                        (see columnDomain), so it can never disagree with the shading. */}
                    <span className="hm-colrange">{rangeLabel}</span>
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
