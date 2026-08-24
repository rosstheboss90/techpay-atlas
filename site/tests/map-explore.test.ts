import { describe, expect, it } from 'vitest'
import { MAP_H, MAP_W, type Bubble } from '../lib/map-bubbles'
import { pickAt, recentreAfterZoom, zoomScale, PATCH_PX, type ScrollView } from '../lib/map-explore'

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

describe('recentreAfterZoom', () => {
  // The real measurement that motivated this: Fit-height at scrollLeft 350 in a 360px-wide
  // container over an 1,088px map — the viewport centre sits at 48.7% of the country. Clicking
  // 2x grows the extent to 2,177px; leaving scrollLeft alone drops that centre to 24.3%.
  const fit: ScrollView = {
    scrollLeft: 350, scrollTop: 120,
    clientWidth: 360, clientHeight: 610,
    scrollWidth: 1088, scrollHeight: 900,
  }
  const centreOf = (scroll: number, client: number, extent: number) => (scroll + client / 2) / extent

  it('keeps the same point of the map under the centre of the viewport', () => {
    const before = centreOf(fit.scrollLeft, fit.clientWidth, fit.scrollWidth)
    const { scrollLeft } = recentreAfterZoom(fit, {
      clientWidth: 360, clientHeight: 610, scrollWidth: 2177, scrollHeight: 1220,
    })
    expect(centreOf(scrollLeft, 360, 2177)).toBeCloseTo(before, 6)
    // And is nowhere near the do-nothing answer, which is the bug this replaces.
    expect(centreOf(fit.scrollLeft, 360, 2177)).toBeCloseTo(0.243, 3)
  })

  it('recentres both axes, not just the horizontal one', () => {
    const before = centreOf(fit.scrollTop, fit.clientHeight, fit.scrollHeight)
    const { scrollTop } = recentreAfterZoom(fit, {
      clientWidth: 360, clientHeight: 610, scrollWidth: 2177, scrollHeight: 1220,
    })
    expect(centreOf(scrollTop, 610, 1220)).toBeCloseTo(before, 6)
  })

  it('is a no-op when the extent does not change', () => {
    expect(recentreAfterZoom(fit, {
      clientWidth: fit.clientWidth, clientHeight: fit.clientHeight,
      scrollWidth: fit.scrollWidth, scrollHeight: fit.scrollHeight,
    })).toEqual({ scrollLeft: 350, scrollTop: 120 })
  })

  it('clamps to the scrollable range rather than returning an unreachable offset', () => {
    // Centre near the right edge, then zoom OUT: the ideal offset is past the new maximum.
    const atEdge: ScrollView = { ...fit, scrollLeft: 1088 - 360, scrollTop: 0 }
    const { scrollLeft } = recentreAfterZoom(atEdge, {
      clientWidth: 360, clientHeight: 610, scrollWidth: 500, scrollHeight: 900,
    })
    expect(scrollLeft).toBeLessThanOrEqual(500 - 360)
    expect(scrollLeft).toBeGreaterThanOrEqual(0)
  })

  it('never returns a negative offset when the content is smaller than the viewport', () => {
    const { scrollLeft, scrollTop } = recentreAfterZoom(
      { ...fit, scrollLeft: 0, scrollTop: 0 },
      { clientWidth: 360, clientHeight: 610, scrollWidth: 200, scrollHeight: 100 },
    )
    expect(scrollLeft).toBe(0)
    expect(scrollTop).toBe(0)
  })

  it('returns the origin for an unmeasured container instead of NaN', () => {
    const zero: ScrollView = {
      scrollLeft: 0, scrollTop: 0, clientWidth: 0, clientHeight: 0, scrollWidth: 0, scrollHeight: 0,
    }
    expect(recentreAfterZoom(zero, { clientWidth: 0, clientHeight: 0, scrollWidth: 0, scrollHeight: 0 }))
      .toEqual({ scrollLeft: 0, scrollTop: 0 })
    expect(recentreAfterZoom(fit, { clientWidth: 360, clientHeight: 610, scrollWidth: 0, scrollHeight: 0 }))
      .toEqual({ scrollLeft: 0, scrollTop: 0 })
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
