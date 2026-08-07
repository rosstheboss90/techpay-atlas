import type { LocatedLca } from './aggregate'
import { median } from './aggregate'
import { canonicalEmployer, type AliasEntity } from './employer-identity'

export interface EmployerRoleMetro { cbsa: string; filings: number; median: number }
export interface EmployerRoleStat {
  national: { filings: number; p25: number; median: number; p75: number }
  metros: EmployerRoleMetro[]
}
export interface EmployerProfile {
  key: string
  slug: string
  display: string
  category: 'staffing' | 'direct'
  aliased: boolean
  totalFilings: number
  entities: { name: string; filings: number }[]
  roles: Record<string, EmployerRoleStat>
}

/** Nearest-rank quantile on an ascending-sorted array, via the continuous 1-indexed rank
 *  h = q*(n-1)+1 rounded to the closest integer rank (ties round up). Plain ceil(q*n) (as used
 *  by p99Of in aggregate.ts for a p99 clamp) skews low at small n / low q — e.g. n=4, q=0.25
 *  gives rank 1 (the minimum) instead of the 2nd of 4 values — which is wrong for a quartile
 *  meant to sit strictly inside the distribution. */
function quantile(sortedAsc: number[], q: number): number {
  const n = sortedAsc.length
  if (n === 0) throw new Error('quantile of empty input')
  const rank = Math.min(n, Math.max(1, Math.round(q * (n - 1) + 1)))
  return sortedAsc[rank - 1]
}

interface Acc {
  key: string; slug: string; category: 'staffing' | 'direct'; aliased: boolean
  aliasDisplay: string | null
  casings: Map<string, number>
  byRole: Map<string, { wages: number[]; byCbsa: Map<string, number[]> }>
}

/** Transpose LCA records into employer-major profiles.
 *
 *  MUST be fed `run.ts`'s `employerRecords`, never the emitted employers/{cbsa}.json files:
 *  those are truncated at topN=15 per (cbsa, soc), so an employer ranked 16th in a metro is
 *  absent there and its national total would silently undercount. */
export function aggregateEmployerProfiles(
  records: readonly LocatedLca[],
  aliasIndex: Map<string, AliasEntity>,
): Map<string, EmployerProfile> {
  const accs = new Map<string, Acc>()
  for (const r of records) {
    const c = canonicalEmployer(r.employer, aliasIndex)
    let a = accs.get(c.key)
    if (!a) {
      a = {
        key: c.key, slug: c.slug, category: c.category, aliased: c.aliased,
        aliasDisplay: c.aliased ? c.display : null,
        casings: new Map(), byRole: new Map(),
      }
      accs.set(c.key, a)
    }
    a.casings.set(r.employer, (a.casings.get(r.employer) ?? 0) + 1)
    let role = a.byRole.get(r.soc)
    if (!role) { role = { wages: [], byCbsa: new Map() }; a.byRole.set(r.soc, role) }
    role.wages.push(r.annualWage)
    let metroWages = role.byCbsa.get(r.cbsa)
    if (!metroWages) { metroWages = []; role.byCbsa.set(r.cbsa, metroWages) }
    metroWages.push(r.annualWage)
  }

  const out = new Map<string, EmployerProfile>()
  for (const [key, a] of accs) {
    const entities = [...a.casings.entries()]
      .map(([name, filings]) => ({ name, filings }))
      .sort((x, y) => y.filings - x.filings || x.name.localeCompare(y.name))
    const roles: Record<string, EmployerRoleStat> = {}
    let totalFilings = 0
    for (const [soc, role] of a.byRole) {
      const sorted = [...role.wages].sort((x, y) => x - y)
      totalFilings += sorted.length
      roles[soc] = {
        national: {
          filings: sorted.length,
          p25: quantile(sorted, 0.25),
          median: median(sorted),
          p75: quantile(sorted, 0.75),
        },
        metros: [...role.byCbsa.entries()]
          .map(([cbsa, wages]) => ({ cbsa, filings: wages.length, median: median(wages) }))
          .sort((x, y) => y.filings - x.filings || x.cbsa.localeCompare(y.cbsa)),
      }
    }
    out.set(key, {
      key, slug: a.slug, display: a.aliasDisplay ?? entities[0].name,
      category: a.category, aliased: a.aliased, totalFilings, entities, roles,
    })
  }
  return out
}
