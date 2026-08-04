import { scaleQuantize, scaleSqrt } from 'd3-scale'

// Validated in Task 5 Step 1 — the dataviz validator's ordinal (sequential-ramp)
// checks flagged both ramps' weak-contrast anchor step (the palest step in
// LIGHT mode, the darkest step in DARK mode) below the 2:1 surface-contrast
// floor. A single-step fix breaks monotonic order (the only headroom left in
// order is far short of the needed contrast), so both ramps are respaced —
// same hue and per-step chroma, lightness redistributed — keeping the strong
// anchor end (darkest step of LIGHT / lightest step of DARK) unchanged. See
// task report for original -> corrected hex mapping and validator output.
export const RAMP_LIGHT = ['#a4afbd', '#869db5', '#678bae', '#4778a7', '#2b649d', '#1c5189', '#173f6f']
export const RAMP_DARK = ['#435770', '#4a6a8d', '#517da8', '#5d91c1', '#70a5d5', '#8cb8e2', '#aecbe9']

export function bubbleRadius(emp: number | null, maxEmp: number): number {
  if (emp == null || maxEmp <= 0) return 2.5
  return Math.max(2.5, scaleSqrt().domain([0, maxEmp]).range([0, 26])(emp))
}

/** Quantized sequential color; null (no data / unadjustable) -> muted line token. */
export function bubbleColor(v: number | null, domain: [number, number], ramp: string[]): string {
  if (v == null) return 'var(--line)'
  if (domain[0] === domain[1]) return ramp[Math.floor(ramp.length / 2)]
  return scaleQuantize<string>().domain(domain).range(ramp)(v)
}
