import { num } from './num'

/** BEA MARPP rows -> a single global vintage year plus CBSA -> all-items RPP for that year only.
 *  The year is the latest year column whose non-null count is >= 90% of the best year's non-null
 *  count (no per-row fallback: a metro NA in the chosen year is simply absent from the map). */
export function rppRowsToMap(rows: Record<string, string>[]): { year: number; values: Map<string, number> } {
  const valid = rows
    .filter(r => String(r.LineCode).trim() === '1')
    .map(r => ({ fips: String(r.GeoFIPS ?? '').replace(/"/g, '').trim(), row: r }))
    .filter(({ fips }) => /^\d{5}$/.test(fips) && !fips.startsWith('00')) // 00xxx = US/aggregate lines

  const years = [...new Set(valid.flatMap(({ row }) => Object.keys(row).filter(k => /^\d{4}$/.test(k))))]
    .map(Number)
    .sort((a, b) => b - a) // latest first

  const counts = new Map<number, number>()
  for (const y of years) counts.set(y, valid.filter(({ row }) => num(row[String(y)]) !== null).length)
  const bestCount = Math.max(0, ...counts.values())
  const year = years.find(y => (counts.get(y) ?? 0) >= bestCount * 0.9) ?? years[0]

  const values = new Map<string, number>()
  for (const { fips, row } of valid) {
    const v = num(row[String(year)])
    if (v !== null) values.set(fips, v)
  }
  return { year, values }
}
