// Mirrors pipeline/lib/build-metro-trends.ts's MetroTrend contract field-for-field (root type
// renamed) (per-metro file under site/public/data/trends/<cbsa>.json). The site cannot import
// from pipeline/ (static export, no backend, separate npm tree), so this is a deliberate
// duplicate type, same reason title-types.ts and trends-types.ts exist.

export interface MetroTrendRole {
  nominal: (number | null)[]
  real: (number | null)[]
  /** true = median (p50) censored that vintage; the point is null. Distinct from
   *  trends-types.ts's `cappedP90`, which flags p90 on the NATIONAL series — different
   *  percentile by design, do not conflate the two. */
  capped: boolean[]
}

/** A metro redefinition. `from`/`to` are the ORIGINAL published titles, so the panel can name
 *  what actually changed ("Austin-Round Rock-Georgetown → Austin-Round Rock-San Marcos") rather
 *  than just asserting that something did. */
export interface DelineationBreak {
  year: number
  from: string
  to: string
}

/** Named MetroTrendData, not MetroTrend, because `MetroTrend` is the COMPONENT in
 *  components/MetroTrend.tsx. A type and a component sharing a name forces an import alias at
 *  every call site and reads as a mistake. */
export interface MetroTrendData {
  cbsa: string
  name: string
  years: number[]
  breaks: DelineationBreak[]
  deflator: { series: string; period: string; base: number }
  /** Each vintage's own BLS top code, same order as `years`. Trend-level, not per-role. */
  topCodes: number[]
  roles: Record<string, MetroTrendRole>
}
