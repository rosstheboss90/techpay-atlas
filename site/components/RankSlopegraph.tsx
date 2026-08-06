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
const PAD_TOP = 36, ROW_GAP = 28, PAD_BOTTOM = 16

/* Label gutters are derived from the widest label rather than fixed, because the
   old constants (LEFT_X=210 in a W=560 box) clipped both ends: an end-anchored
   label like "San Jose-Sunnyvale-Santa Clara · $213k" starts near x=-50, and its
   right-hand twin runs past x=560. Nothing outside the viewBox is drawn.
   CH_PX over-estimates advance width for the 12px UI sans so movers, which render
   at weight 650, still fit. */
const CH_PX = 7.1
const LABEL_GAP = 12
const SPAN_MIN = 200, SPAN_MAX = 460, TARGET_W = 1140

const gutter = (maxChars: number) => Math.ceil(maxChars * CH_PX) + LABEL_GAP + 8

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

  const leftText = (r: (typeof rows)[number]) => `${short(r.name)} · ${dollars(r.nominal, r.capped)}`
  const rightText = (r: (typeof rows)[number]) => `${dollars(r.adjusted, r.capped)} · ${short(r.name)}`
  const GUTTER_L = gutter(Math.max(...rows.map(r => leftText(r).length)))
  const GUTTER_R = gutter(Math.max(...rows.map(r => rightText(r).length)))
  // Claim the container width where the gutters leave room, but keep the line
  // span in the range where the crossing pattern stays readable.
  const SPAN = Math.min(SPAN_MAX, Math.max(SPAN_MIN, TARGET_W - GUTTER_L - GUTTER_R))
  const LEFT_X = GUTTER_L
  const RIGHT_X = LEFT_X + SPAN
  const W = RIGHT_X + GUTTER_R

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
                <text x={LEFT_X - LABEL_GAP} y={y1} dy="0.32em" textAnchor="end" className="slope-label">
                  {leftText(r)}
                </text>
                <text x={RIGHT_X + LABEL_GAP} y={y2} dy="0.32em" textAnchor="start" className="slope-label">
                  {rightText(r)}
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
