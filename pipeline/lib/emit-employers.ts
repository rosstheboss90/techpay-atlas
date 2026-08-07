import type { EmployerProfile } from './aggregate-employer-profiles'

export interface EmployerHeadRow {
  slug: string; display: string; filings: number
  category: 'staffing' | 'direct'; aliased: boolean; topRole: string
  /** Extra lowercased names this employer actually filed under, for search. Present only when
   *  they add something `display` does not already contain.
   *
   *  Without it, an aliased employer is unreachable by its real name: `display` is the curated
   *  short form ("Amazon"), so typing "amazon web" matched nothing even though
   *  "Amazon Web Services, Inc." is thousands of real filings. That is the "typing more makes
   *  the result vanish" failure, and it hit the eleven largest employers on the site. */
  search?: string
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

/** Cap on filed names carried into the head file for search. The head is fetched eagerly, so
 *  this is a size bound; entities are ordered by filings, so the cap keeps the ones that matter. */
const MAX_SEARCH_ENTITIES = 8

/** Lowercased filed names that `display` does not already contain, joined for substring search.
 *  Returns undefined when display already covers every entity — which is the common case for an
 *  unaliased employer, whose variants differ only in case and punctuation. */
function searchTermsFor(p: EmployerProfile): string | undefined {
  const display = p.display.toLowerCase()
  const seen = new Set<string>()
  for (const e of p.entities.slice(0, MAX_SEARCH_ENTITIES)) {
    const name = e.name.toLowerCase()
    if (name !== display && !display.includes(name)) seen.add(name)
  }
  return seen.size ? [...seen].join(' | ') : undefined
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
      employers: head.map(p => {
        const search = searchTermsFor(p)
        return {
          slug: p.slug, display: p.display, filings: p.totalFilings,
          category: p.category, aliased: p.aliased, topRole: topRoleOf(p),
          ...(search ? { search } : {}),
        }
      }),
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

/** Share of ALL filings absorbed by aliased entities.
 *
 *  REPORTED ONLY — deliberately no longer a tripwire. It measures alias *coverage*, so curating
 *  one more correct entry raises it monotonically; it cannot distinguish "we curated more" from
 *  "a rule over-merged", which is the thing a ceiling on it was supposed to catch. At a 0.25 cap
 *  the real value of 0.235 left ~5,600 filings of headroom, so adding any three of HCL,
 *  Accenture or Capgemini would have failed the build with "over-broad alias rule" — a false
 *  accusation about correct curation. Over-breadth is a per-entity property; see maxEntityShare. */
export function aliasCollapse(profiles: Map<string, EmployerProfile>): number {
  let total = 0, aliased = 0
  for (const p of profiles.values()) {
    total += p.totalFilings
    if (p.aliased) aliased += p.totalFilings
  }
  return total === 0 ? 0 : aliased / total
}

/** The largest share of all filings held by any single canonical employer, with its slug.
 *
 *  This is the real over-breadth detector: a `match` rule that swallows unrelated companies
 *  shows up as one entity ballooning, regardless of how many entries the alias file has. Adding
 *  a correct twelfth entry cannot trip it. Amazon, the largest, currently sits near 5.7%. */
export function maxEntityShare(profiles: Map<string, EmployerProfile>): { slug: string; share: number } {
  let total = 0, top = { slug: '', filings: 0 }
  for (const p of profiles.values()) {
    total += p.totalFilings
    if (p.totalFilings > top.filings) top = { slug: p.slug, filings: p.totalFilings }
  }
  return { slug: top.slug, share: total === 0 ? 0 : top.filings / total }
}

/** Share of the top-N filers' filings that resolved through the alias file. Bounded on BOTH
 *  sides: too low means the file rotted or was half-applied and the head fragments back into
 *  variants; too high means alias resolution is swallowing more of the head than curation
 *  plausibly accounts for. Both bounds use this same denominator, unlike the old pairing of
 *  aliasCollapse (over all filings) with aliasCoverage (over head filings), which moved relative
 *  to each other whenever the head's share of total filings shifted. */
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
