'use client'
import { useEffect, useMemo, useState } from 'react'
import type { EmployerBundle, EmployerFile, Meta, Salaries, SalaryRow } from '../lib/types'
import { loadEmployers } from '../lib/data'
import { adjust } from '../lib/derive'
import { fmtUsd, fmtUsdCompact } from '../lib/format'
import { beeswarmAxisMax, pctForSalary, sharedBandDomain, type PctResult } from '../lib/compare'
import { PercentileBand } from './PercentileBand'

interface Props {
  meta: Meta
  salaries: Salaries
  soc: string
  adjusted: boolean
  metroA: string
  metroB: string
  onSelect: (patch: { metro?: string; vs?: string }) => void
}

const W = 300

/** Lazy-load a metro's employer file (only when it has filings); independent load/error state. */
function useEmployerFile(cbsa: string, enabled: boolean) {
  const [file, setFile] = useState<EmployerFile | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setFile(null); setError(false)
    if (!enabled) { setLoading(false); return }
    setLoading(true)
    let live = true
    loadEmployers(cbsa)
      .then(f => { if (live) { setFile(f); setLoading(false) } })
      .catch(() => { if (live) { setError(true); setLoading(false) } })
    return () => { live = false }
  }, [cbsa, enabled])
  return { file, error, loading }
}

function pctText(r: PctResult | null): string {
  if (r == null) return 'not enough data'
  if (r.kind === 'below') return 'under the 10th percentile'
  if (r.kind === 'above') return 'above the 90th percentile'
  return `about the ${r.pct}th percentile`
}

function Swarm({ bundle, rpp, adjusted, axisMax, loading, error, lcaFilings }: {
  bundle: EmployerBundle | undefined; rpp: number | null; adjusted: boolean; axisMax: number
  loading: boolean; error: boolean; lcaFilings: number
}) {
  if (lcaFilings === 0) return <span className="h2h-note">No H-1B filings on record.</span>
  if (loading) return <span className="h2h-note">Loading employers…</span>
  if (error) return <span className="h2h-note">Couldn't load employer data.</span>
  if (!bundle) return <span className="h2h-note">No filings for this role here.</span>
  if (bundle.n <= 2) return <span className="h2h-note">{bundle.n} filing{bundle.n === 1 ? '' : 's'} — too few to plot.</span>
  const pts = bundle.sample.map(v => adjust(v, rpp, adjusted)).filter((v): v is number => v != null)
  if (!pts.length) return <span className="h2h-note">No cost-of-living index for this metro.</span>
  const H = 30, midY = H / 2
  const x = (v: number) => Math.max(0, Math.min(W, (v / (axisMax || 1)) * W))
  const jitter = (v: number) => ((Math.round(v / 1000) % 7) - 3) * 2.6 // deterministic, no Math.random
  return (
    <svg width={W} height={H} className="h2h-swarm-svg" role="img" aria-label={`${bundle.n} filings, ${pts.length} sampled`}>
      {pts.map((v, i) => <circle key={i} cx={x(v)} cy={midY + jitter(v)} r={2.4} className="h2h-dot" />)}
    </svg>
  )
}

export function HeadToHead({ meta, salaries, soc, adjusted, metroA, metroB, onSelect }: Props) {
  const mA = meta.metros.find(m => m.cbsa === metroA)
  const mB = meta.metros.find(m => m.cbsa === metroB)
  const rowA = salaries[metroA]?.[soc]
  const rowB = salaries[metroB]?.[soc]
  const rppA = mA?.rpp ?? null, rppB = mB?.rpp ?? null

  const empA = useEmployerFile(metroA, (mA?.lcaFilings ?? 0) > 0)
  const empB = useEmployerFile(metroB, (mB?.lcaFilings ?? 0) > 0)
  const bundleA = empA.file?.roles[soc]
  const bundleB = empB.file?.roles[soc]

  const [targetStr, setTargetStr] = useState('')
  const target = useMemo(() => {
    const n = Number(targetStr.replace(/[^0-9]/g, ''))
    return targetStr.trim() && n > 0 ? n : null
  }, [targetStr])

  const domain = useMemo(() => sharedBandDomain(rowA, rowB, rppA, rppB, adjusted), [rowA, rowB, rppA, rppB, adjusted])
  const axisMax = useMemo(() => beeswarmAxisMax(bundleA, bundleB, rppA, rppB, adjusted), [bundleA, bundleB, rppA, rppB, adjusted])

  const roleLabel = meta.roles.find(r => r.soc === soc)?.label ?? soc
  const median = (row: SalaryRow | undefined, rpp: number | null) => {
    const v = adjust(row?.p50 ?? null, rpp, adjusted)
    return v == null ? '—' : fmtUsd(Math.round(v))
  }

  const cols = [
    { key: 'A', m: mA, row: rowA, rpp: rppA, bundle: bundleA, emp: empA },
    { key: 'B', m: mB, row: rowB, rpp: rppB, bundle: bundleB, emp: empB },
  ] as const

  return (
    <section className="h2h" aria-labelledby="h2h-h">
      <header className="h2h-head">
        <h2 id="h2h-h">Are you underpaid?</h2>
        <p className="h2h-note-sub">{roleLabel}{adjusted ? ' · cost-of-living adjusted' : ''} · pick two metros</p>
      </header>

      <div className="h2h-controls">
        <label className="h2h-pick">Metro A
          <select value={metroA} aria-label="Metro A" onChange={e => onSelect({ metro: e.target.value })}>
            {meta.metros.map(m => <option key={m.cbsa} value={m.cbsa}>{m.name}</option>)}
          </select>
        </label>
        <span className="h2h-vs" aria-hidden="true">vs</span>
        <label className="h2h-pick">Metro B
          <select value={metroB} aria-label="Metro B" onChange={e => onSelect({ vs: e.target.value })}>
            {meta.metros.map(m => <option key={m.cbsa} value={m.cbsa}>{m.name}</option>)}
          </select>
        </label>
        <label className="h2h-target">Target salary
          <input type="text" inputMode="numeric" placeholder="$150,000" value={targetStr}
                 aria-label="Target salary" onChange={e => setTargetStr(e.target.value)} />
        </label>
      </div>

      {metroA === metroB && <p className="h2h-hint">Pick two different metros to compare.</p>}

      <div className="h2h-block">
        <p className="h2h-caption">
          Percentile pay, shared scale{target != null ? ` · target ${fmtUsd(target)}` : ''}
        </p>
        {cols.map(c => (
          <div className="h2h-row" key={c.key}>
            <span className="h2h-rowlabel" title={c.m?.name}>{c.m ? c.m.name.split(',')[0] : c.key}</span>
            {c.row
              ? <PercentileBand row={c.row} rpp={c.rpp} adjusted={adjusted} domain={domain} width={W} marker={target} />
              : <span className="h2h-note">no data</span>}
            <span className="h2h-rowmed">{median(c.row, c.rpp)}</span>
            {target != null && c.row && (
              <span className="h2h-pct">{pctText(pctForSalary(c.row, target, c.rpp, adjusted))}</span>
            )}
          </div>
        ))}
      </div>

      <div className="h2h-block">
        <p className="h2h-caption">Real H-1B filings, shared scale (0 – {fmtUsdCompact(axisMax)}, clamped at the 99th percentile)</p>
        {cols.map(c => (
          <div className="h2h-row" key={c.key}>
            <span className="h2h-rowlabel" title={c.m?.name}>{c.m ? c.m.name.split(',')[0] : c.key}</span>
            <Swarm bundle={c.bundle} rpp={c.rpp} adjusted={adjusted} axisMax={axisMax}
                   loading={c.emp.loading} error={c.emp.error} lcaFilings={c.m?.lcaFilings ?? 0} />
          </div>
        ))}
      </div>
    </section>
  )
}
