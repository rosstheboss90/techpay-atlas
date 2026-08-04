import type { LocatedLca } from './aggregate'
import { median } from './aggregate'
import { FAMILIES, bucketFor, parseSeniority, type Tier, type TitleBucketDef } from './titles'

export interface TitleStats { filings: number; p25: number; median: number; p75: number }
export interface TitleBucketAgg {
  key: string; label: string
  national: TitleStats
  metros: Record<string, TitleStats>
  tiers: Partial<Record<Tier, TitleStats>>
  socMix: { soc: string; share: number }[]
  topEmployers: { name: string; filings: number; median: number }[]
}

const q = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]

const EMPTY_STATS: TitleStats = { filings: 0, p25: 0, median: 0, p75: 0 }

const stats = (wages: number[]): TitleStats => {
  if (wages.length === 0) return EMPTY_STATS
  const s = [...wages].sort((a, b) => a - b)
  return { filings: s.length, p25: q(s, 0.25), median: median(s), p75: q(s, 0.75) }
}

/** cbsa/soc/employer grouping mirrors aggregateEmployers' case-insensitive merge idiom
 *  (local re-implementation, not extracted — the shapes being grouped differ enough that
 *  sharing a helper would add indirection for no behavior change in the v1 path). */
export function aggregateTitles(
  records: LocatedLca[],
  opts: Partial<{ metroMin: number; tierMin: number }> = {},
): { families: { key: string; label: string; buckets: TitleBucketAgg[] }[]; matchedTotal: number } {
  const { metroMin = 8, tierMin = 25 } = opts
  const byBucket = new Map<string, LocatedLca[]>()
  let matchedTotal = 0
  for (const r of records) {
    const b = bucketFor(r.title)
    if (!b) continue
    matchedTotal++
    let arr = byBucket.get(b.key)
    if (!arr) { arr = []; byBucket.set(b.key, arr) }
    arr.push(r)
  }

  const build = (def: TitleBucketDef): TitleBucketAgg => {
    const recs = byBucket.get(def.key) ?? []
    const wages = recs.map(r => r.annualWage)
    const byMetro = new Map<string, number[]>()
    const byTier = new Map<Tier, number[]>()
    const bySoc = new Map<string, number>()
    const byEmp = new Map<string, { casings: Map<string, number>; wages: number[] }>()

    for (const r of recs) {
      let metroWages = byMetro.get(r.cbsa)
      if (!metroWages) { metroWages = []; byMetro.set(r.cbsa, metroWages) }
      metroWages.push(r.annualWage)

      const tier = parseSeniority(r.title)
      let tierWages = byTier.get(tier)
      if (!tierWages) { tierWages = []; byTier.set(tier, tierWages) }
      tierWages.push(r.annualWage)

      bySoc.set(r.soc, (bySoc.get(r.soc) ?? 0) + 1)

      const empKey = r.employer.toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()
      let e = byEmp.get(empKey)
      if (!e) { e = { casings: new Map<string, number>(), wages: [] }; byEmp.set(empKey, e) }
      e.casings.set(r.employer, (e.casings.get(r.employer) ?? 0) + 1)
      e.wages.push(r.annualWage)
    }

    const metros: Record<string, TitleStats> = {}
    for (const [cbsa, ws] of [...byMetro].sort(([a], [b]) => a.localeCompare(b)))
      if (ws.length >= metroMin) metros[cbsa] = stats(ws)

    const tiers: TitleBucketAgg['tiers'] = {}
    for (const [tier, ws] of byTier) if (ws.length >= tierMin) tiers[tier] = stats(ws)

    const socSorted = [...bySoc.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    const top4 = socSorted.slice(0, 4)
    const rest = socSorted.slice(4).reduce((a, [, n]) => a + n, 0)
    const total = recs.length || 1
    const socMix = [
      ...top4.map(([soc, n]) => ({ soc, share: n / total })),
      ...(rest ? [{ soc: 'other', share: rest / total }] : []),
    ]

    const topEmployers = [...byEmp.values()]
      .map(e => ({
        name: [...e.casings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
        filings: e.wages.length,
        median: median(e.wages),
      }))
      .sort((a, b) => b.filings - a.filings || a.name.localeCompare(b.name))
      .slice(0, 5)

    return { key: def.key, label: def.label, national: stats(wages), metros, tiers, socMix, topEmployers }
  }

  return {
    families: FAMILIES.map(f => ({ key: f.key, label: f.label, buckets: f.buckets.map(build) })),
    matchedTotal,
  }
}
