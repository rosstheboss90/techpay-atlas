import { num } from './num'

/** HUD USPS ZIP-CBSA rows -> ZIP(5) -> CBSA, choosing max BUS_RATIO (TOT_RATIO tiebreak,
 *  then lexicographically smaller cbsa); junk/non-metro CBSA cells (blank, non-numeric, 99999) dropped. */
export function hudRowsToZipCbsa(rows: Record<string, unknown>[]): Map<string, string> {
  const best = new Map<string, { cbsa: string; score: number }>()
  for (const r of rows) {
    const cbsa = String(r.CBSA ?? '').trim()
    if (!/^\d{5}$/.test(cbsa) || cbsa === '99999') continue
    const zip = String(r.ZIP ?? '').trim().padStart(5, '0')
    if (!/^\d{5}$/.test(zip)) continue
    const score = (num(r.BUS_RATIO) ?? 0) * 1000 + (num(r.TOT_RATIO) ?? 0)
    const cur = best.get(zip)
    if (!cur || score > cur.score || (score === cur.score && cbsa < cur.cbsa)) best.set(zip, { cbsa, score })
  }
  return new Map([...best].map(([zip, v]) => [zip, v.cbsa]))
}
