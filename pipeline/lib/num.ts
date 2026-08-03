/** Currency/number cell -> number, or null for blank/suppressed (*, **, #) / unparseable. Never 0-defaults. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[$,]/g, '').trim()
  if (s === '' || s === '*' || s === '**' || s === '#') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** OEWS top-codes annual percentile wages at this value instead of suppressing them. */
export const TOP_CODE = 239_200

/** Like num(), but recognizes '#' as a top-code (>= TOP_CODE) rather than suppression. */
export function cell(v: unknown): { value: number | null; capped: boolean } {
  const s = String(v ?? '').replace(/[$,]/g, '').trim()
  if (s === '#') return { value: TOP_CODE, capped: true }
  return { value: num(v), capped: false }
}
