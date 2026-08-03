/** Currency/number cell -> number, or null for blank/suppressed (*, **, #) / unparseable. Never 0-defaults. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[$,]/g, '').trim()
  if (s === '' || s === '*' || s === '**' || s === '#') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
