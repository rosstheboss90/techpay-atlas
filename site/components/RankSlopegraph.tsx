'use client'
import { useMemo } from 'react'
import type { Meta, Metric, Salaries } from '../lib/types'
import { fmtUsdCompact } from '../lib/format'
import { slopeRows } from '../lib/slopegraph'

interface Props {
  meta: Meta
  salaries: Salaries
  soc: string
  metric: Metric
  onSelect: (cbsa: string) => void
}

const N = 18
const PAD_TOP = 34, ROW_GAP = 26, PAD_BOTTOM = 14
const LEFT_X = 210, RIGHT_X = 360, W = 560

/** ≥ 3 rank places moved counts as a "mover"; direction from the sign of delta. */
function moveClass(delta: number): string {
  const dir = delta > 0 ? 'slope-rise' : delta < 0 ? 'slope-fall' : 'slope-flat'
  return Math.abs(delta) >= 3 ? `${dir} is-mover` : dir
}
function moveText(delta: number): string {
  if (delta > 0) return `rose ${delta}`
  if (delta < 0) return `fell ${-delta}`
  return 'unchanged'
}

export function RankSlopegraph({ meta, salaries, soc, metric, onSelect }: Props) {
  const roleLabel = meta.roles.find(r => r.soc === soc)?.label ?? soc
  const rows = useMemo(
    () => (metric === 'pay' ? slopeRows(meta.metros, salaries, soc, N) : []),
    [meta.metros, salaries, soc, metric],
  )

  const header = (
    <header className="slope-head">
      <h2 id="slope-h">Cost of living flips the ranking</h2>
      <p className="slope-note">
        {roleLabel} · top {rows.length || N} metros by pay · order shown is among these metros
      </p>
    </header>
  )

  if (metric !== 'pay') {
    return (
      <section className="slope" aria-labelledby="slope-h">
        {header}
        <p className="slope-msg">Switch the metric to <strong>Pay</strong> to see the cost-of-living rank flip.</p>
      </section>
    )
  }
  if (rows.length < 2) {
    return (
      <section className="slope" aria-labelledby="slope-h">
        {header}
        <p className="slope-msg">Not enough pay data for this role to compare metros.</p>
      </section>
    )
  }

  const H = PAD_TOP + (rows.length - 1) * ROW_GAP + PAD_BOTTOM
  const y = (rank: number) => PAD_TOP + (rank - 1) * ROW_GAP
  const short = (name: string) => name.split(',')[0]
  const dollars = (v: number, capped: boolean) => `${capped ? '≥' : ''}${fmtUsdCompact(v)}`

  return (
    <section className="slope" aria-labelledby="slope-h">
      {header}
      <div className="slope-legend" aria-hidden="true">
        <span className="slope-key slope-rise"><i /> rises under adjustment</span>
        <span className="slope-key slope-fall"><i /> falls</span>
      </div>
      <div className="slope-scroll">
        <svg className="slope-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
          <text x={LEFT_X} y={16} className="slope-axis" textAnchor="end">Nominal</text>
          <text x={RIGHT_X} y={16} className="slope-axis" textAnchor="start">Adjusted</text>
          {rows.map(r => {
            const y1 = y(r.nominalRank), y2 = y(r.adjustedRank)
            return (
              <g key={r.cbsa} className={`slope-row ${moveClass(r.delta)}`} onClick={() => onSelect(r.cbsa)}>
                <line x1={LEFT_X} y1={y1} x2={RIGHT_X} y2={y2} className="slope-line" />
                <circle cx={LEFT_X} cy={y1} r={3.5} className="slope-node" />
                <circle cx={RIGHT_X} cy={y2} r={3.5} className="slope-node" />
                <text x={LEFT_X - 12} y={y1} dy="0.32em" textAnchor="end" className="slope-label">
                  {short(r.name)} · {dollars(r.nominal, r.capped)}
                </text>
                <text x={RIGHT_X + 12} y={y2} dy="0.32em" textAnchor="start" className="slope-label">
                  {dollars(r.adjusted, r.capped)} · {short(r.name)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      {/* Accessible + keyboard-interactive layer backing the aria-hidden SVG. */}
      <ol className="sr-only">
        {rows.map(r => (
          <li key={r.cbsa}>
            <button type="button" onClick={() => onSelect(r.cbsa)}>
              {r.name}: rank {r.nominalRank} nominal, {r.adjustedRank} adjusted ({moveText(r.delta)})
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
