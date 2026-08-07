import { ROLES } from './soc'
import type { NationalArchive } from './history'

export interface TrendsRole {
  label: string
  short: string
  firstYear: number
  nominal: (number | null)[]
  real: (number | null)[]
  emp: (number | null)[]
  cappedP90: boolean[]
  changeReal: number
}

export interface TrendsJson {
  years: number[]
  headlineFrom: number
  headlineTo: number
  deflator: { series: string; period: string; base: number }
  roles: Record<string, TrendsRole>
  breaks: { year: number; note: string }[]
  skippedRoles: string[]
}

/** Archives + CPI -> the site's trends contract, in `base`-year dollars.
 *
 *  Deflation is CPI-U May-to-May: OEWS's reference period is May, so no interpolation is needed.
 *  BEA RPP is deliberately NOT used here — it is a SPATIAL index renormalised to US=100 every
 *  year, so an RPP-adjusted series over time measures nothing coherent.
 *
 *  `headlineFrom` is the earliest year every role exists as its own SOC code. Roles that predate
 *  it keep their longer history in `nominal`/`real`; only the headline number is windowed, so the
 *  ranked figure compares like with like while the path figure stays honest about what it has. */
export function buildTrends(
  archives: readonly NationalArchive[],
  cpiMayByYear: Readonly<Record<number, number>>,
  base: number,
  headlineFrom: number,
): TrendsJson {
  const sorted = [...archives].sort((a, b) => a.year - b.year)
  const years = sorted.map(a => a.year)
  if (!years.includes(headlineFrom)) {
    throw new Error(`headline start year ${headlineFrom} is not among the archived vintages (${years.join(', ')})`)
  }

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

  const headlineTo = years[years.length - 1]
  const iFrom = years.indexOf(headlineFrom)
  // The final year by position, not `indexOf(headlineTo)` — a duplicate vintage in `archives`
  // would make indexOf resolve to the wrong (first) matching element.
  const iTo = years.length - 1

  const roles: Record<string, TrendsRole> = {}
  const skippedRoles: string[] = []
  for (const role of ROLES) {
    const nominal = sorted.map(a => a.roles[role.soc]?.p50 ?? null)
    const emp = sorted.map(a => a.roles[role.soc]?.emp ?? null)
    const cappedP90 = sorted.map(a => (a.roles[role.soc]?.capped ?? []).includes('p90'))
    const real = nominal.map((v, i) => (v === null ? null : v * (baseCpi / cpiMayByYear[years[i]])))

    const first = years.find((_, i) => nominal[i] !== null)
    if (first === undefined) {
      // In the registry but in no archived vintage at all — e.g. a SOC added to ROLES before
      // BLS has published it. Record it so a consumer can surface the gap instead of the role
      // just vanishing from both figures.
      skippedRoles.push(role.soc)
      continue
    }

    // A role whose history ends before the headline window even opens (e.g. a code retired pre-
    // 2021) simply isn't part of the current comparison — that's out of scope, not a data bug.
    // Skip it rather than erroring, but still record it: silently dropping it would also drop it
    // from the path figure, which exists specifically to show longer history.
    const reachesHeadlineWindow = years.some((y, i) => y >= headlineFrom && nominal[i] !== null)
    if (!reachesHeadlineWindow) {
      skippedRoles.push(role.soc)
      continue
    }

    const a = real[iFrom], b = real[iTo]
    if (a === null || a === 0) {
      throw new Error(`${role.soc} is absent from the headline start year ${headlineFrom} — it cannot be ranked`)
    }
    if (b === null) {
      throw new Error(`${role.soc} is absent from the headline end year ${headlineTo} — it cannot be ranked`)
    }
    roles[role.soc] = {
      label: role.label, short: role.short, firstYear: first,
      nominal, real, emp, cappedP90, changeReal: b / a - 1,
    }
  }

  // How many roles first appear exactly at the headline start — the ones BLS split out of a
  // combined code that May. Derived from the data rather than hardcoded, so the prose can't
  // drift out of sync with wherever `headlineFrom` actually points.
  const splitCount = Object.values(roles).filter(r => r.firstYear === headlineFrom).length

  return {
    years,
    headlineFrom,
    headlineTo,
    deflator: { series: 'CUUR0000SA0', period: 'May', base },
    roles,
    skippedRoles,
    breaks: [{
      year: headlineFrom,
      note: `BLS split several combined occupation codes into detailed ones in May ${headlineFrom}. ` +
        `${splitCount} of these roles have no separate data before then.`,
    }],
  }
}
