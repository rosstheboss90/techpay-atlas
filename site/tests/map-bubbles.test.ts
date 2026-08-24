import { describe, expect, it } from 'vitest'
import { buildBubbles, MAP_W, MAP_H } from '../lib/map-bubbles'
import { RAMP_LIGHT } from '../lib/map-scales'
import type { Meta, Salaries } from '../lib/types'

const metro = (cbsa: string, name: string, lat: number, lng: number, rpp: number | null = 100) =>
  ({ cbsa, name, state: 'CA', lat, lng, rpp, lcaFilings: 0 })

const meta = {
  year: 2025, generated: '', roles: [], topCodeValue: 239200, rppYear: 2024, lcaPeriod: '',
  sources: { oews: '', lca: [], hud: '', zipMatchRate: 1 },
  metros: [
    metro('41940', 'San Jose, CA', 37.33, -121.89),
    metro('42660', 'Seattle, WA', 47.6, -122.33),
    metro('99999', 'San Juan, PR', 18.46, -66.11),   // geoAlbersUsa cannot place PR
    metro('11111', 'Nodata, XX', 40, -100),
  ],
} as unknown as Meta

const salaries: Salaries = {
  '41940': { '15-1252': { emp: 100, lq: 1, p10: 1, p25: 2, p50: 213110, p75: 4, p90: 5 } },
  '42660': { '15-1252': { emp: 900, lq: 1, p10: 1, p25: 2, p50: 167000, p75: 4, p90: 5 } },
  '99999': { '15-1252': { emp: 10, lq: 1, p10: 1, p25: 2, p50: 90000, p75: 4, p90: 5 } },
  '11111': {},
}

describe('buildBubbles', () => {
  it('projects placeable metros inside the map box and omits unplaceable ones', () => {
    const { bubbles } = buildBubbles(meta, salaries, '15-1252', 'pay', false, RAMP_LIGHT)
    expect(bubbles.map(b => b.m.cbsa).sort()).toEqual(['11111', '41940', '42660'])
    for (const b of bubbles) {
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x).toBeLessThanOrEqual(MAP_W)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeLessThanOrEqual(MAP_H)
    }
  })

  it('keeps a metro with no salary row, with a null value', () => {
    const { bubbles } = buildBubbles(meta, salaries, '15-1252', 'pay', false, RAMP_LIGHT)
    expect(bubbles.find(b => b.m.cbsa === '11111')!.v).toBeNull()
  })

  it('sorts large bubbles first so small metros stay hoverable on top', () => {
    const { bubbles } = buildBubbles(meta, salaries, '15-1252', 'pay', false, RAMP_LIGHT)
    const radii = bubbles.map(b => b.r)
    expect(radii).toEqual([...radii].sort((a, b) => b - a))
  })

  it('domain spans the metric extent of placed metros', () => {
    const { domain } = buildBubbles(meta, salaries, '15-1252', 'pay', false, RAMP_LIGHT)
    expect(domain).toEqual([167000, 213110])
  })

  it('adjusted mode divides by RPP', () => {
    const withRpp = { ...meta, metros: [metro('41940', 'San Jose, CA', 37.33, -121.89, 125)] } as Meta
    const { bubbles } = buildBubbles(withRpp, salaries, '15-1252', 'pay', true, RAMP_LIGHT)
    expect(bubbles[0].v).toBeCloseTo(213110 / 1.25, 0)
  })
})
