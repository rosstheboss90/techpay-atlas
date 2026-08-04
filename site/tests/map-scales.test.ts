import { describe, expect, it } from 'vitest'
import { bubbleColor, bubbleRadius, RAMP_LIGHT } from '../lib/map-scales'

describe('map scales', () => {
  it('radius is sqrt-scaled and clamped', () => {
    expect(bubbleRadius(0, 100000)).toBeCloseTo(2.5, 1)     // floor for tiny metros
    expect(bubbleRadius(100000, 100000)).toBe(26)           // max employment -> max radius
    expect(bubbleRadius(25000, 100000)).toBeCloseTo(13, 1)  // sqrt: quarter emp -> half range
  })
  it('color maps domain into the ramp and null to the muted token', () => {
    expect(bubbleColor(0, [0, 100], RAMP_LIGHT)).toBe(RAMP_LIGHT[0])
    expect(bubbleColor(100, [0, 100], RAMP_LIGHT)).toBe(RAMP_LIGHT[RAMP_LIGHT.length - 1])
    expect(bubbleColor(null, [0, 100], RAMP_LIGHT)).toBe('var(--line)')
  })
  it('degenerate domain (every metro tied) maps to the middle ramp step', () => {
    expect(bubbleColor(5, [5, 5], RAMP_LIGHT)).toBe(RAMP_LIGHT[Math.floor(RAMP_LIGHT.length / 2)])
  })
})
