import { MAP_H, MAP_W, type Bubble } from './map-bubbles'

export type Zoom = 'poster' | 'fit' | '2x'

/** Half of the 44px platform tap-target guidance — the radius of one thumb contact patch. */
export const PATCH_PX = 22

/** Rendered pixels per viewBox unit for each zoom step.
 *  `poster` fits the width (the inline hero framing, whole country visible); `fit` fits the
 *  height, which is where the accuracy comes from — the map is 1.6:1 and a phone is ~1:2.2, so
 *  a width-fitted map wastes most of the screen. Measured: fit-height alone moves aimed-tap
 *  accuracy from 26% to 66%, and 2x reaches 90%. A 4x step was measured as adding nothing.
 *  Falls back to a positive scale when the container has not been measured yet (jsdom, first
 *  paint) so callers never divide by zero. */
export function zoomScale(zoom: Zoom, wrapW: number, wrapH: number): number {
  if (zoom === 'poster') return wrapW > 0 ? wrapW / MAP_W : 1
  const fit = wrapH > 0 ? wrapH / MAP_H : 1
  return zoom === '2x' ? fit * 2 : fit
}

export interface Pick {
  hit: Bubble | null
  /** Other metros inside the same thumb patch. Non-zero means the selection was ambiguous. */
  rivals: number
}

/** Nearest metro to a tap, in viewBox coordinates, but ONLY within one thumb patch.
 *
 *  Deliberately returns `null` rather than the nearest bubble when nothing is in range: measured
 *  against all 387 real metros with a realistic 8px touch error, a nearest-bubble rule selects
 *  the intended city just 26% of the time, so "always pick something" means confidently showing
 *  the wrong city three times in four. A miss the user can see is better than a wrong answer they
 *  cannot. `rivals` exists for the same reason — the caller must SAY when a pick was ambiguous. */
export function pickAt(bubbles: Bubble[], vx: number, vy: number, scale: number): Pick {
  let hit: Bubble | null = null
  let best = Infinity
  let rivals = 0
  for (const b of bubbles) {
    const d = Math.hypot(b.x - vx, b.y - vy) * scale
    if (d <= PATCH_PX) rivals++
    if (d < best) { best = d; hit = b }
  }
  if (best > PATCH_PX) return { hit: null, rivals: 0 }
  return { hit, rivals: Math.max(0, rivals - 1) }
}
