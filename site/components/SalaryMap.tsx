'use client'
import { useMemo, useState } from 'react'
import type { Metric, Meta, Salaries } from '../lib/types'
import { fmtNum, fmtUsdCompact } from '../lib/format'
import { buildBubbles, MAP_H, MAP_W, statesPath } from '../lib/map-bubbles'
import { RAMP_DARK, RAMP_LIGHT, bubbleRadius } from '../lib/map-scales'

interface Props {
  meta: Meta
  salaries: Salaries
  soc: string
  metric: Metric
  adjusted: boolean
  selected: string | null
  dark: boolean
  onSelect: (cbsa: string | null) => void
}

interface Hover { cbsa: string; x: number; y: number }

/** Same text for the hover tooltip and the bubble's accessible name. */
function formatMetricValue(v: number | null, metric: Metric, rppMissing: boolean, adjusted: boolean): string {
  if (metric === 'pay') return v != null ? fmtUsdCompact(v) : rppMissing && adjusted ? 'no RPP data' : 'no data'
  if (metric === 'emp') return fmtNum(v)
  return v != null ? `${v.toFixed(2)}× nat'l avg` : 'no data'
}

/** Legend-scale endpoint label, matching each metric's own unit convention. */
function formatLegendValue(v: number, metric: Metric): string {
  if (metric === 'pay') return fmtUsdCompact(v)
  if (metric === 'emp') return fmtNum(v)
  return `${v.toFixed(1)}×`
}

export function SalaryMap({ meta, salaries, soc, metric, adjusted, selected, dark, onSelect }: Props) {
  const [hover, setHover] = useState<Hover | null>(null)
  const ramp = dark ? RAMP_DARK : RAMP_LIGHT

  const { bubbles, domain, maxEmp } = useMemo(
    () => buildBubbles(meta, salaries, soc, metric, adjusted, ramp),
    [meta, salaries, soc, metric, adjusted, ramp],
  )

  const hovered = hover ? bubbles.find(b => b.m.cbsa === hover.cbsa) : null
  const smallEmp = Math.round(maxEmp / 10)

  const select = (cbsa: string) => onSelect(selected === cbsa ? null : cbsa)

  return (
    <figure className="map-figure">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="group" aria-label="US metro map of tech pay" className="salary-map">
        <path d={statesPath} className="map-states" />
        {bubbles.map(b => (
          <circle
            key={b.m.cbsa} cx={b.x} cy={b.y} r={b.r} fill={b.fill}
            tabIndex={0} role="button"
            aria-label={`${b.m.name}: ${formatMetricValue(b.v, metric, b.m.rpp == null, adjusted)}`}
            className={`map-bubble${selected === b.m.cbsa ? ' is-selected' : ''}`}
            onMouseEnter={e => setHover({ cbsa: b.m.cbsa, x: e.clientX, y: e.clientY })}
            onMouseMove={e => setHover({ cbsa: b.m.cbsa, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHover(null)}
            onClick={() => select(b.m.cbsa)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(b.m.cbsa) }
            }}
          />
        ))}
      </svg>
      {hover && hovered && (
        <div className="map-tooltip" style={{
          left: Math.min(hover.x + 12, window.innerWidth - 180),
          top: Math.min(hover.y + 12, window.innerHeight - 70),
        }}>
          <strong>{hovered.m.name}</strong>
          <span>{formatMetricValue(hovered.v, metric, hovered.m.rpp == null, adjusted)}</span>
        </div>
      )}
      <figcaption className="map-legend">
        <span className="legend-scale">
          <span className="legend-value">{formatLegendValue(domain[0], metric)}</span>
          <span className="legend-ramp">{ramp.map(c => <i key={c} style={{ background: c }} />)}</span>
          <span className="legend-value">{formatLegendValue(domain[1], metric)}</span>
        </span>
        <span className="legend-size" aria-hidden="true">
          {/* Nested and baseline-aligned, at the map's own radius scale. The box has
              to fit bubbleRadius()'s 26px max: the old 60x28 clipped the large
              circle on all four sides, which rendered as a stray squiggle. */}
          <svg width="58" height="56" className="legend-bubbles">
            <circle cx="28" cy={54 - bubbleRadius(maxEmp, maxEmp)} r={bubbleRadius(maxEmp, maxEmp)} className="legend-bubble" />
            <circle cx="28" cy={54 - bubbleRadius(smallEmp, maxEmp)} r={bubbleRadius(smallEmp, maxEmp)} className="legend-bubble" />
          </svg>
          <span>{fmtNum(smallEmp)}–{fmtNum(maxEmp)} jobs</span>
        </span>
        <span>{metric === 'pay' ? (adjusted ? 'median pay, COL-adjusted' : 'median pay') : metric === 'emp' ? 'employment' : 'concentration'} · bubble size = jobs</span>
      </figcaption>
    </figure>
  )
}
