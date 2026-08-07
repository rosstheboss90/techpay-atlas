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
 *  top-coding threshold) for the CURRENT vintage. This is NOT a ceiling on emitted data: only
 *  percentile cells that were literally `#` in the source get this value, so nothing downstream
 *  should assume no emitted number exceeds TOP_CODE.
 *
 *  For any vintage other than the current one, use makeCell(topCodeForYear(year)) — the threshold
 *  changes between releases, and reading an old file with this constant rewrites that year's
 *  censored cells upward (spec trap T2). */
export const TOP_CODE = 239_200

/** Builds a cell reader bound to one vintage's top code. Like num(), but recognizes '#' as a
 *  top-code (>= topCode) rather than suppression. */
export function makeCell(topCode: number) {
  return function cell(v: unknown): { value: number | null; capped: boolean } {
    const s = String(v ?? '').replace(/[$,]/g, '').trim()
    if (s === '#') return { value: topCode, capped: true }
    return { value: num(v), capped: false }
  }
}

/** Current-vintage cell reader. Retained so existing callers are unchanged. */
export const cell = makeCell(TOP_CODE)
