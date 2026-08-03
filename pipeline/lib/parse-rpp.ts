import { num } from './num'

/** BEA MARPP rows -> CBSA -> all-items RPP (latest year that has a value). */
export function rppRowsToMap(rows: Record<string, string>[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    if (String(r.LineCode).trim() !== '1') continue
    const fips = String(r.GeoFIPS ?? '').replace(/"/g, '').trim()
    if (!/^\d{5}$/.test(fips) || fips.startsWith('00')) continue // 00xxx = US/aggregate lines
    const years = Object.keys(r).filter(k => /^\d{4}$/.test(k)).sort().reverse()
    for (const y of years) {
      const v = num(r[y])
      if (v !== null) { out.set(fips, v); break }
    }
  }
  return out
}
