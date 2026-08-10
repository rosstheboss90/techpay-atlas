import { ROLES } from './soc'
import type { MsaArchive } from './history'
import type { DelineationBreak, MetroDelineation } from './delineation'

export interface MetroTrendRole {
  nominal: (number | null)[]
  real: (number | null)[]
  /** true = median censored that vintage; the point is null */
  capped: boolean[]
}

// Mirrored in site/lib/metro-trend-types.ts as MetroTrendData; changes here must land there in
// the same commit.
export interface MetroTrend {
  cbsa: string
  name: string
  years: number[]
  /** Full break objects, not just years, are emitted deliberately: the panel can then say
   *  *what* changed ("Austin-Round Rock-Georgetown -> Austin-Round Rock-San Marcos") rather than
   *  only *when*, which is materially more honest for a few dozen bytes per metro. */
  breaks: DelineationBreak[]
  deflator: { series: string; period: string; base: number }
  /** Each vintage's own BLS top code (`MsaArchive.topCode`), same order as `years`. Trend-level,
   *  not per-role: the ceiling is a property of the vintage's file, not of any one occupation. */
  topCodes: number[]
  roles: Record<string, MetroTrendRole>
}

/** One metro's real-wage history, in `base`-year dollars.
 *
 *  Deflation is CPI-U May-to-May, matching OEWS's May reference period.
 *
 *  ⚠️ BEA RPP is NOT used here and must never be. RPP is a SPATIAL index renormalised to US = 100
 *  every year, so an RPP-adjusted series over time measures nothing coherent — the index resets
 *  annually and the line would be an artifact. The panel's `adjusted` prop means RPP; this data is
 *  deliberately independent of it. */
export function buildMetroTrend(
  cbsa: string,
  archives: readonly MsaArchive[],
  cpiMayByYear: Readonly<Record<number, number>>,
  base: number,
  delineation: Readonly<Record<string, MetroDelineation>>,
): MetroTrend | null {
  const sorted = [...archives].sort((a, b) => a.year - b.year)
  const years = sorted.map(a => a.year)

  // A CPI value must be a real, positive number: `undefined` alone isn't the whole hazard, since
  // 0/negative/NaN would silently propagate as Infinity/NaN into `real`, which JSON.stringify
  // then writes as `null` under a field typed `number`.
  const requireCpi = (year: number): number => {
    const v = cpiMayByYear[year]
    if (v === undefined) throw new Error(`no CPI value for ${year} — the deflator is short`)
    if (!Number.isFinite(v) || v <= 0) throw new Error(`invalid CPI value for ${year}: ${v}`)
    return v
  }
  const baseCpi = requireCpi(base)
  for (const y of years) requireCpi(y)

  // Same shape as requireCpi: a bogus topCode (0, negative, NaN/Infinity) must fail loudly rather
  // than emit a ceiling the panel would silently trust.
  const requireTopCode = (a: MsaArchive): number => {
    if (!Number.isFinite(a.topCode) || a.topCode <= 0) throw new Error(`invalid topCode for vintage ${a.year}`)
    return a.topCode
  }

  if (!sorted.some(a => a.metros[cbsa])) return null

  // Newest vintage that carries a title wins: the current name is what a reader recognises.
  let name = cbsa
  for (const a of sorted) if (a.areas[cbsa]) name = a.areas[cbsa]

  const roles: Record<string, MetroTrendRole> = {}
  for (const role of ROLES) {
    // The skip-empty guard tests the raw archive cells directly (pre-nulling): a role absent from
    // every vintage stays omitted, but a role that is p50-censored in every vintage still has a
    // published cell each year and must be emitted (all-null values, all-true capped) so the
    // panel can render the flags rather than silently dropping the role.
    // NB: a censored p50 is non-null here because makeCell writes the top-code value into '#'
    // cells — if the archive encoding ever changes to {p50:null, capped:['p50']}, this guard must
    // become presence-based or case (d) silently regresses.
    if (sorted.every(a => a.metros[cbsa]?.[role.soc]?.p50 == null)) continue // role never published here — omit rather than emit an empty line
    const rawP50 = sorted.map(a => a.metros[cbsa]?.[role.soc]?.p50 ?? null)
    // p50, not p90: this is a MEDIAN chart, and BLS censors each percentile independently — a
    // p90-only-capped cell must never be flagged (or nulled), and a p50-capped cell always must.
    const capped = sorted.map(a => (a.metros[cbsa]?.[role.soc]?.capped ?? []).includes('p50'))
    // A p50-censored cell is the BLS top-code FLOOR (e.g. 208000 in 2020), not a measured median.
    // Null it so the site's segments() machinery renders a line gap instead of plotting the floor
    // as if it were real data.
    const nominal = rawP50.map((v, i) => (capped[i] ? null : v))
    const real = nominal.map((v, i) => (v === null ? null : v * (baseCpi / cpiMayByYear[years[i]])))
    roles[role.soc] = { nominal, real, capped }
  }

  return {
    cbsa, name, years,
    breaks: delineation[cbsa]?.breaks ?? [],
    deflator: { series: 'CUUR0000SA0', period: 'May', base },
    topCodes: sorted.map(requireTopCode),
    roles,
  }
}
