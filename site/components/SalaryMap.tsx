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

export function SalaryMap({ meta, salaries, soc, metric, adjusted, selected, dark, onSelect }: Props) {
  const [hover, setHover] = useState<Hover | null>(null)
  const ramp = dark ? RAMP_DARK : RAMP_LIGHT

  const bubbles = useMemo(() => {
    const placed = meta.metros
      .map(m => {
        const xy = projection([m.lng, m.lat])
        if (!xy) return null   // geoAlbersUsa cannot place PR — omitted by design
        const row = salaries[m.cbsa]?.[soc]
        return { m, x: xy[0], y: xy[1], v: metricValue(row, m, metric, adjusted), emp: row?.emp ?? null }
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
    const maxEmp = Math.max(1, ...placed.map(b => b.emp ?? 0))
    const dom = extent(placed.map(b => b.v).filter((v): v is number => v != null)) as [number, number]
    // Large bubbles render first so small metros stay hoverable on top.
    return placed
      .map(b => ({ ...b, r: bubbleRadius(b.emp, maxEmp), fill: bubbleColor(b.v, dom ?? [0, 1], ramp) }))
      .sort((a, b) => b.r - a.r)
  }, [meta, salaries, soc, metric, adjusted, ramp])

  const hovered = hover ? bubbles.find(b => b.m.cbsa === hover.cbsa) : null

  return (
    <figure className="map-figure">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="US metro map of tech pay" className="salary-map">
        <path d={statesD} className="map-states" />
        {bubbles.map(b => (
          <circle
            key={b.m.cbsa} cx={b.x} cy={b.y} r={b.r} fill={b.fill}
            className={`map-bubble${selected === b.m.cbsa ? ' is-selected' : ''}`}
            onMouseEnter={e => setHover({ cbsa: b.m.cbsa, x: e.clientX, y: e.clientY })}
            onMouseMove={e => setHover({ cbsa: b.m.cbsa, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect(selected === b.m.cbsa ? null : b.m.cbsa)}
          />
        ))}
      </svg>
      {hovered && (
        <div className="map-tooltip" style={{ left: hover!.x + 12, top: hover!.y + 12 }}>
          <strong>{hovered.m.name}</strong>
          <span>
            {metric === 'pay' && (hovered.v != null ? fmtUsdCompact(hovered.v) : hovered.m.rpp == null && adjusted ? 'no RPP data' : 'no data')}
            {metric === 'emp' && fmtNum(hovered.v)}
            {metric === 'lq' && (hovered.v != null ? `${hovered.v.toFixed(2)}× nat'l avg` : 'no data')}
          </span>
        </div>
      )}
      <figcaption className="map-legend">
        <span className="legend-ramp">{ramp.map(c => <i key={c} style={{ background: c }} />)}</span>
        <span>{metric === 'pay' ? (adjusted ? 'median pay, COL-adjusted' : 'median pay') : metric === 'emp' ? 'employment' : 'concentration'} · bubble size = jobs</span>
      </figcaption>
    </figure>
  )
}
