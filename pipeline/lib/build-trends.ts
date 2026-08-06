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
  const baseCpi = cpiMayByYear[base]
  if (baseCpi === undefined) throw new Error(`no CPI value for base year ${base}`)
  for (const y of years) {
    if (cpiMayByYear[y] === undefined) throw new Error(`no CPI value for ${y} — the deflator is short`)
  }

  const headlineTo = years[years.length - 1]
  const iFrom = years.indexOf(headlineFrom)
  const iTo = years.indexOf(headlineTo)

  const roles: Record<string, TrendsRole> = {}
  for (const role of ROLES) {
    const nominal = sorted.map(a => a.roles[role.soc]?.p50 ?? null)
    const emp = sorted.map(a => a.roles[role.soc]?.emp ?? null)
    const cappedP90 = sorted.map(a => (a.roles[role.soc]?.capped ?? []).includes('p90'))
    const real = nominal.map((v, i) => (v === null ? null : v * (baseCpi / cpiMayByYear[years[i]])))

    const first = years.find((_, i) => nominal[i] !== null)
    if (first === undefined) continue // in the registry but in no archived vintage at all

    // A role whose history ends before the headline window even opens (e.g. a code retired pre-
    // 2021) simply isn't part of the current comparison — that's out of scope, not a data bug.
    // Skip it rather than erroring.
    const reachesHeadlineWindow = years.some((y, i) => y >= headlineFrom && nominal[i] !== null)
    if (!reachesHeadlineWindow) continue

    const a = real[iFrom], b = real[iTo]
    if (a === null || a === 0 || b === null) {
      throw new Error(`${role.soc} is absent from the headline start year ${headlineFrom} — it cannot be ranked`)
    }
    roles[role.soc] = {
      label: role.label, short: role.short, firstYear: first,
      nominal, real, emp, cappedP90, changeReal: b / a - 1,
    }
  }

  return {
    years,
    headlineFrom,
    headlineTo,
    deflator: { series: 'CUUR0000SA0', period: 'May', base },
    roles,
    breaks: [{
      year: headlineFrom,
      note: 'BLS split several combined occupation codes into detailed ones in May 2021. Eight of these roles have no separate data before then.',
    }],
  }
}
