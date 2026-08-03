import { num } from './num'

/** HUD USPS ZIP-CBSA rows -> ZIP(5) -> CBSA, choosing max BUS_RATIO (TOT_RATIO tiebreak); 99999 dropped. */
export function hudRowsToZipCbsa(rows: Record<string, unknown>[]): Map<string, string> {
  const best = new Map<string, { cbsa: string; score: number }>()
  for (const r of rows) {
    const cbsa = String(r.CBSA ?? '').trim().padStart(5, '0')
    if (cbsa === '99999') continue
    const zip = String(r.ZIP ?? '').trim().padStart(5, '0')
    if (!/^\d{5}$/.test(zip)) continue
    const score = (num(r.BUS_RATIO) ?? 0) * 1000 + (num(r.TOT_RATIO) ?? 0)
    const cur = best.get(zip)
    if (!cur || score > cur.score) best.set(zip, { cbsa, score })
  }
  return new Map([...best].map(([zip, v]) => [zip, v.cbsa]))
}
