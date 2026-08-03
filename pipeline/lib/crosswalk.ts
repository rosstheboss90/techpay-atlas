import { num } from './num'

/** Case-insensitive, multi-name column lookup: HUD's own header casing/naming has drifted across
 *  vintages (older extracts: ZIP/CBSA/BUS_RATIO/TOT_RATIO; 2024+ extracts: zip/geoid/bus_ratio/tot_ratio). */
function field(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    for (const k of Object.keys(row)) {
      if (k.toUpperCase() === name) return row[k]
    }
  }
  return undefined
}

/** HUD USPS ZIP-CBSA rows -> ZIP(5) -> CBSA, choosing max BUS_RATIO (TOT_RATIO tiebreak,
 *  then lexicographically smaller cbsa); junk/non-metro CBSA cells (blank, non-numeric, 99999) dropped. */
export function hudRowsToZipCbsa(rows: Record<string, unknown>[]): Map<string, string> {
  const best = new Map<string, { cbsa: string; score: number }>()
  for (const r of rows) {
    const cbsa = String(field(r, 'CBSA', 'GEOID') ?? '').trim()
    if (!/^\d{5}$/.test(cbsa) || cbsa === '99999') continue
    const zip = String(field(r, 'ZIP') ?? '').trim().padStart(5, '0')
    if (!/^\d{5}$/.test(zip)) continue
    const score = (num(field(r, 'BUS_RATIO')) ?? 0) * 1000 + (num(field(r, 'TOT_RATIO')) ?? 0)
    const cur = best.get(zip)
    if (!cur || score > cur.score || (score === cur.score && cbsa < cur.cbsa)) best.set(zip, { cbsa, score })
  }
  return new Map([...best].map(([zip, v]) => [zip, v.cbsa]))
}
