import { ROLES } from './soc'
import type { MsaArchive } from './history'
import type { DelineationBreak, MetroDelineation } from './delineation'

export interface MetroTrendRole {
  nominal: (number | null)[]
  real: (number | null)[]
  capped: boolean[]
}

export interface MetroTrend {
  cbsa: string
  name: string
  years: number[]
  /** Full break objects, not just years, are emitted deliberately: the panel can then say
   *  *what* changed ("Austin-Round Rock-Georgetown -> Austin-Round Rock-San Marcos") rather than
   *  only *when*, which is materially more honest for a few dozen bytes per metro. */
  breaks: DelineationBreak[]
  deflator: { series: string; period: string; base: number }
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

  if (!sorted.some(a => a.metros[cbsa])) return null

  // Newest vintage that carries a title wins: the current name is what a reader recognises.
  let name = cbsa
  for (const a of sorted) if (a.areas[cbsa]) name = a.areas[cbsa]

  const roles: Record<string, MetroTrendRole> = {}
  for (const role of ROLES) {
    const nominal = sorted.map(a => a.metros[cbsa]?.[role.soc]?.p50 ?? null)
    if (nominal.every(v => v === null)) continue // role never published here — omit rather than emit an empty line
    const capped = sorted.map(a => (a.metros[cbsa]?.[role.soc]?.capped ?? []).includes('p90'))
    const real = nominal.map((v, i) => (v === null ? null : v * (baseCpi / cpiMayByYear[years[i]])))
    roles[role.soc] = { nominal, real, capped }
  }

  return {
    cbsa, name, years,
    breaks: delineation[cbsa]?.breaks ?? [],
    deflator: { series: 'CUUR0000SA0', period: 'May', base },
    roles,
  }
}
