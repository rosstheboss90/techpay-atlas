import { describe, expect, it } from 'vitest'
import { MAP_H, MAP_W, type Bubble } from '../lib/map-bubbles'
import { pickAt, zoomScale, PATCH_PX } from '../lib/map-explore'

const bub = (cbsa: string, x: number, y: number): Bubble => ({
  m: { cbsa, name: `${cbsa} City, CA`, state: 'CA', lat: 0, lng: 0, rpp: 100, lcaFilings: 0 },
  x, y, v: 1, emp: 1, r: 2.5, fill: '#000',
})

describe('zoomScale', () => {
  it('poster fits the map to the container width', () => {
    expect(zoomScale('poster', 390, 610)).toBeCloseTo(390 / MAP_W)
  })
  it('fit fits the map to the container height', () => {
    expect(zoomScale('fit', 390, 610)).toBeCloseTo(610 / MAP_H)
  })
  it('2x doubles the fit-height scale', () => {
    expect(zoomScale('2x', 390, 610)).toBeCloseTo((610 / MAP_H) * 2)
  })
  it('never returns a non-finite or negative scale when the container is unmeasured', () => {
    for (const z of ['poster', 'fit', '2x'] as const) {
      const s = zoomScale(z, 0, 0)
      expect(Number.isFinite(s)).toBe(true)
      expect(s).toBeGreaterThan(0)
    }
  })
})

describe('pickAt', () => {
  const scale = 1   // 1 rendered px per viewBox unit keeps the arithmetic readable

  it('selects the metro under the tap', () => {
    const { hit, rivals } = pickAt([bub('A', 100, 100)], 102, 100, scale)
    expect(hit!.m.cbsa).toBe('A')
    expect(rivals).toBe(0)
  })

  it('selects NOTHING beyond the patch rather than guessing the nearest', () => {
    const { hit } = pickAt([bub('A', 100, 100)], 100 + PATCH_PX + 1, 100, scale)
    expect(hit).toBeNull()
  })

  it('reports rivals sharing the thumb patch — ambiguity is never hidden', () => {
    const bubbles = [bub('A', 100, 100), bub('B', 105, 100), bub('C', 110, 100), bub('D', 400, 400)]
    const { hit, rivals } = pickAt(bubbles, 100, 100, scale)
    expect(hit!.m.cbsa).toBe('A')
    expect(rivals).toBe(2)
  })

  it('zooming in separates rivals that shared a patch when zoomed out', () => {
    const bubbles = [bub('A', 100, 100), bub('B', 115, 100)]
    expect(pickAt(bubbles, 100, 100, 1).rivals).toBe(1)
    expect(pickAt(bubbles, 100, 100, 4).rivals).toBe(0)
  })

  it('picks the closest when several are in range', () => {
    const bubbles = [bub('A', 100, 100), bub('B', 108, 100)]
    expect(pickAt(bubbles, 107, 100, scale).hit!.m.cbsa).toBe('B')
  })

  it('returns no hit for an empty bubble set', () => {
    expect(pickAt([], 10, 10, scale)).toEqual({ hit: null, rivals: 0 })
  })
})
