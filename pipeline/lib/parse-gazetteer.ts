/** Census CBSA gazetteer rows (tab-delimited) -> CBSA -> {lat,lng}. Trims both keys and values. */
export function gazetteerRowsToMap(rows: Record<string, string>[]): Map<string, { lat: number; lng: number }> {
  const out = new Map<string, { lat: number; lng: number }>()
  for (const raw of rows) {
    const r: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) r[k.trim()] = String(v ?? '').trim()
    if (!r.GEOID || r.INTPTLAT === '' || r.INTPTLONG === '') continue
    const lat = Number(r.INTPTLAT), lng = Number(r.INTPTLONG)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    out.set(r.GEOID, { lat, lng })
  }
  return out
}
