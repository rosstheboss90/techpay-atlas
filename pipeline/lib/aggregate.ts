import type { LcaRecord } from './parse-lca'

export type LocatedLca = LcaRecord & { cbsa: string }
export interface EmployerStat { name: string; filings: number; median: number }
export interface EmployerBundle { employers: EmployerStat[]; sample: number[]; n: number }

export function median(xs: number[]): number {
  if (xs.length === 0) throw new Error('median of empty array')
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

const employerKey = (employer: string) =>
  employer.toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()

/** cbsa -> soc -> { top-N employers by filing count (case-insensitive merge, most common casing kept),
 *  every-kth sorted wage sample for the beeswarm }. */
export function aggregateEmployers(
  records: LocatedLca[],
  opts: Partial<{ topN: number; sampleMax: number }> = {},
): Map<string, Map<string, EmployerBundle>> {
  const { topN = 15, sampleMax = 200 } = opts
  const groups = new Map<string, Map<string, LocatedLca[]>>()
  for (const r of records) {
    let bySoc = groups.get(r.cbsa)
    if (!bySoc) { bySoc = new Map<string, LocatedLca[]>(); groups.set(r.cbsa, bySoc) }
    let recs = bySoc.get(r.soc)
    if (!recs) { recs = []; bySoc.set(r.soc, recs) }
    recs.push(r)
  }
  const out = new Map<string, Map<string, EmployerBundle>>()
  for (const [cbsa, bySoc] of groups) {
    const bundles = new Map<string, EmployerBundle>()
    for (const [soc, recs] of bySoc) {
      const byEmployer = new Map<string, { casings: Map<string, number>; wages: number[] }>()
      for (const r of recs) {
        const key = employerKey(r.employer)
        let e = byEmployer.get(key)
        if (!e) { e = { casings: new Map<string, number>(), wages: [] }; byEmployer.set(key, e) }
        e.casings.set(r.employer, (e.casings.get(r.employer) ?? 0) + 1)
        e.wages.push(r.annualWage)
      }
      const employers = [...byEmployer.values()]
        .map(e => ({
          name: [...e.casings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
          filings: e.wages.length,
          median: median(e.wages),
        }))
        .sort((a, b) => b.filings - a.filings || a.name.localeCompare(b.name))
        .slice(0, topN)
      const sorted = recs.map(r => r.annualWage).sort((a, b) => a - b)
      const step = Math.max(1, Math.ceil(sorted.length / sampleMax))
      const sample = sorted.filter((_, i) => i % step === 0).slice(0, sampleMax)
      if (sorted.length && sample.at(-1) !== sorted.at(-1)) sample.push(sorted.at(-1)!)
      bundles.set(soc, { employers, sample, n: recs.length })
    }
    out.set(cbsa, bundles)
  }
  return out
}
