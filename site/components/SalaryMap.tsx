'use client'
import { useMemo, useState } from 'react'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { extent } from 'd3-array'
import { feature } from 'topojson-client'
import statesTopo from 'us-atlas/states-10m.json'
import type { Metric, Meta, Salaries } from '../lib/types'
import { metricValue } from '../lib/derive'
import { fmtNum, fmtUsdCompact } from '../lib/format'
import { RAMP_DARK, RAMP_LIGHT, bubbleColor, bubbleRadius } from '../lib/map-scales'

const W = 975, H = 610
const projection = geoAlbersUsa().scale(1300).translate([W / 2, H / 2])
// topojson-client's types are loose over raw JSON; the cast is confined to this line.
const states = feature(statesTopo as never, (statesTopo as unknown as { objects: { states: never } }).objects.states)
const statesD = geoPath(projection)(states as never) ?? ''

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

  const { bubbles, domain, maxEmp } = useMemo(() => {
    const placed = meta.metros
      .map(m => {
        const xy = projection([m.lng, m.lat])
        if (!xy) return null   // geoAlbersUsa cannot place PR — omitted by design
        const row = salaries[m.cbsa]?.[soc]
        return { m, x: xy[0], y: xy[1], v: metricValue(row, m, metric, adjusted), emp: row?.emp ?? null }
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
    const maxEmp = Math.max(1, ...placed.map(b => b.emp ?? 0))
    const [lo, hi] = extent(placed.map(b => b.v).filter((v): v is number => v != null))
    const domain: [number, number] = lo == null || hi == null ? [0, 1] : [lo, hi]
    // Large bubbles render first so small metros stay hoverable on top.
    const bubbles = placed
      .map(b => ({ ...b, r: bubbleRadius(b.emp, maxEmp), fill: bubbleColor(b.v, domain, ramp) }))
      .sort((a, b) => b.r - a.r)
    return { bubbles, domain, maxEmp }
  }, [meta, salaries, soc, metric, adjusted, ramp])

  const hovered = hover ? bubbles.find(b => b.m.cbsa === hover.cbsa) : null
  const smallEmp = Math.round(maxEmp / 10)

  const select = (cbsa: string) => onSelect(selected === cbsa ? null : cbsa)

  return (
    <figure className="map-figure">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="US metro map of tech pay" className="salary-map">
        <path d={statesD} className="map-states" />
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
          <svg width="60" height="28" className="legend-bubbles">
            <circle cx="14" cy="21" r={bubbleRadius(smallEmp, maxEmp)} className="legend-bubble" />
            <circle cx="42" cy="14" r={bubbleRadius(maxEmp, maxEmp)} className="legend-bubble" />
          </svg>
          <span>{fmtNum(smallEmp)}–{fmtNum(maxEmp)} jobs</span>
        </span>
        <span>{metric === 'pay' ? (adjusted ? 'median pay, COL-adjusted' : 'median pay') : metric === 'emp' ? 'employment' : 'concentration'} · bubble size = jobs</span>
      </figcaption>
    </figure>
  )
}
