import type { LcaRecord } from './parse-lca'

export type LocatedLca = LcaRecord & { cbsa: string }
export interface EmployerStat { name: string; count: number; median: number }
export interface EmployerBundle { employers: EmployerStat[]; sample: number[] }

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function attachCbsa(records: LcaRecord[], zipCbsa: Map<string, string>):
  { matched: LocatedLca[]; matchRate: number; unmatchedZips: Map<string, number> } {
  const matched: LocatedLca[] = []
  const unmatchedZips = new Map<string, number>()
  for (const r of records) {
    const cbsa = zipCbsa.get(r.zip)
    if (cbsa) matched.push({ ...r, cbsa })
    else unmatchedZips.set(r.zip, (unmatchedZips.get(r.zip) ?? 0) + 1)
  }
  return { matched, matchRate: records.length ? matched.length / records.length : 0, unmatchedZips }
}

/** cbsa -> soc -> { top-N employers by filing count (case-insensitive merge, most common casing kept),
 *  every-kth sorted wage sample for the beeswarm }. */
export function aggregateEmployers(records: LocatedLca[], opts = { topN: 15, sampleMax: 200 }):
  Map<string, Map<string, EmployerBundle>> {
  const groups = new Map<string, Map<string, LocatedLca[]>>()
  for (const r of records) {
    const bySoc = groups.get(r.cbsa) ?? new Map<string, LocatedLca[]>()
    groups.set(r.cbsa, bySoc)
    bySoc.set(r.soc, [...(bySoc.get(r.soc) ?? []), r])
  }
  const out = new Map<string, Map<string, EmployerBundle>>()
  for (const [cbsa, bySoc] of groups) {
    const bundles = new Map<string, EmployerBundle>()
    for (const [soc, recs] of bySoc) {
      const byEmployer = new Map<string, { casings: Map<string, number>; wages: number[] }>()
      for (const r of recs) {
        const key = r.employer.toUpperCase()
        const e = byEmployer.get(key) ?? { casings: new Map<string, number>(), wages: [] }
        byEmployer.set(key, e)
        e.casings.set(r.employer, (e.casings.get(r.employer) ?? 0) + 1)
        e.wages.push(r.annualWage)
      }
      const employers = [...byEmployer.values()]
        .map(e => ({
          name: [...e.casings.entries()].sort((a, b) => b[1] - a[1])[0][0],
          count: e.wages.length,
          median: median(e.wages),
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, opts.topN)
      const sorted = recs.map(r => r.annualWage).sort((a, b) => a - b)
      const step = Math.max(1, Math.ceil(sorted.length / opts.sampleMax))
      const sample = sorted.filter((_, i) => i % step === 0).slice(0, opts.sampleMax)
      bundles.set(soc, { employers, sample })
    }
    out.set(cbsa, bundles)
  }
  return out
}
