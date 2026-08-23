import { geoAlbersUsa, geoPath } from 'd3-geo'
import { extent } from 'd3-array'
import { feature } from 'topojson-client'
import statesTopo from 'us-atlas/states-10m.json'
import type { Meta, Metric, MetroMeta, Salaries } from './types'
import { metricValue } from './derive'
import { bubbleColor, bubbleRadius } from './map-scales'

export const MAP_W = 975
export const MAP_H = 610

export const projection = geoAlbersUsa().scale(1300).translate([MAP_W / 2, MAP_H / 2])

// topojson-client's types are loose over raw JSON; the cast is confined to this line.
const states = feature(statesTopo as never, (statesTopo as unknown as { objects: { states: never } }).objects.states)

/** The US outline path, projected once at module load — identical for every consumer. */
export const statesPath = geoPath(projection)(states as never) ?? ''

export interface Bubble {
  m: MetroMeta
  x: number
  y: number
  v: number | null
  emp: number | null
  r: number
  fill: string
}

export interface BubbleSet {
  bubbles: Bubble[]
  domain: [number, number]
  maxEmp: number
}

/** Project every metro the Albers USA projection can place, size it by employment and colour it
 *  by the active metric. Pure: the same inputs always give the same bubble set, which is what
 *  lets the inline hero and the fullscreen explorer agree by construction. */
export function buildBubbles(
  meta: Meta, salaries: Salaries, soc: string, metric: Metric, adjusted: boolean, ramp: string[],
): BubbleSet {
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
}
