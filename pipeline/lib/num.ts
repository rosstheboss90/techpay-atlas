const NUM_SHAPE = /^\$?-?[\d,]+(\.\d+)?$/

/** Currency/number cell -> number, or null for blank/suppressed (*, **, #) / unparseable. Never 0-defaults.
 *  Validates cell shape before stripping $/commas so Number()'s permissive parsing (scientific
 *  notation, stray trailing garbage, etc.) can't sneak an unintended value through. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  if (s === '' || s === '*' || s === '**' || s === '#') return null
  if (!NUM_SHAPE.test(s)) return null
  const n = Number(s.replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Substitution value OEWS writes into a `#` cell instead of the true percentile wage (its
 *  top-coding threshold). This is NOT a ceiling on emitted data: only percentile cells that
 *  were literally `#` in the source get this value, so nothing downstream should assume no
 *  emitted number exceeds TOP_CODE. */
export const TOP_CODE = 239_200

/** Like num(), but recognizes '#' as a top-code (>= TOP_CODE) rather than suppression. */
export function cell(v: unknown): { value: number | null; capped: boolean } {
  const s = String(v ?? '').replace(/[$,]/g, '').trim()
  if (s === '#') return { value: TOP_CODE, capped: true }
  return { value: num(v), capped: false }
}
