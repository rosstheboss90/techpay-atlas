import type { EmployerProfile } from './aggregate-employer-profiles'

export interface EmployerHeadRow {
  slug: string; display: string; filings: number
  category: 'staffing' | 'direct'; aliased: boolean; topRole: string
}
export interface EmployerHeadJson { lcaPeriod: string; employers: EmployerHeadRow[] }

/** Positional-array encoding: `k` names the columns, `v` holds one array per filer. Keeps the
 *  full-tail index small enough to fetch on a keystroke. */
export interface EmployerIndexShard { k: string[]; v: (string | number | boolean)[][] }

export interface EmployerProfileJson extends EmployerProfile { lcaPeriod: string }

export interface EmployerArtifacts {
  head: EmployerHeadJson
  index: Record<string, EmployerIndexShard>
  profiles: EmployerProfileJson[]
  stats: { prerendered: number; tail: number; equivalentFloor: number }
}

const INDEX_COLUMNS = ['slug', 'display', 'filings', 'category', 'aliased', 'topRole', 'topCbsa', 'median']

/** The SOC this employer files most under — the one-line summary a search hit shows. */
function topRoleOf(p: EmployerProfile): string {
  return Object.entries(p.roles)
    .sort((a, b) => b[1].national.filings - a[1].national.filings || a[0].localeCompare(b[0]))[0][0]
}

export function buildEmployerArtifacts(
  profiles: Map<string, EmployerProfile>,
  lcaPeriod: string,
  prerenderCount: number,
): EmployerArtifacts {
  const ranked = [...profiles.values()]
    .sort((a, b) => b.totalFilings - a.totalFilings || a.slug.localeCompare(b.slug))
  const head = ranked.slice(0, prerenderCount)

  const index: Record<string, EmployerIndexShard> = {}
  for (const p of ranked) {
    const first = p.slug.charAt(0)
    const shardKey = /[a-z0-9]/.test(first) ? first : '_'
    let shard = index[shardKey]
    if (!shard) { shard = { k: INDEX_COLUMNS, v: [] }; index[shardKey] = shard }
    const role = topRoleOf(p)
    const stat = p.roles[role]
    shard.v.push([
      p.slug, p.display, p.totalFilings, p.category, p.aliased,
      role, stat.metros[0].cbsa, stat.national.median,
    ])
  }
  for (const shard of Object.values(index)) {
    shard.v.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  }

  return {
    head: {
      lcaPeriod,
      employers: head.map(p => ({
        slug: p.slug, display: p.display, filings: p.totalFilings,
        category: p.category, aliased: p.aliased, topRole: topRoleOf(p),
      })),
    },
    index,
    profiles: head.map(p => ({ ...p, lcaPeriod })),
    stats: {
      prerendered: head.length,
      tail: ranked.length - head.length,
      equivalentFloor: head.length ? head[head.length - 1].totalFilings : 0,
    },
  }
}

/** Share of ALL filings absorbed by aliased entities. High means an over-broad alias rule. */
export function aliasCollapse(profiles: Map<string, EmployerProfile>): number {
  let total = 0, aliased = 0
  for (const p of profiles.values()) {
    total += p.totalFilings
    if (p.aliased) aliased += p.totalFilings
  }
  return total === 0 ? 0 : aliased / total
}

/** Share of the top-N filers' filings that resolved through the alias file. Low means the file
 *  has rotted or was half-applied — the head fragments back into variants, silently. */
export function aliasCoverage(profiles: Map<string, EmployerProfile>, topN: number): number {
  const ranked = [...profiles.values()]
    .sort((a, b) => b.totalFilings - a.totalFilings || a.slug.localeCompare(b.slug))
    .slice(0, topN)
  let total = 0, aliased = 0
  for (const p of ranked) {
    total += p.totalFilings
    if (p.aliased) aliased += p.totalFilings
  }
  return total === 0 ? 0 : aliased / total
}
