import { normalizeTitle } from './normalize-title'

export interface ConflationSoc { soc: string; filings: number; share: number }
export interface ConflationTitle {
  title: string       // normalized job title
  filings: number     // total filings under this title
  socCount: number    // distinct SOC codes it was filed under (raw conflation degree)
  socs: ConflationSoc[] // top-K SOCs by filings + an aggregated { soc: 'other' } tail
}
export interface ConflationAgg {
  titles: ConflationTitle[]
  totalFilings: number    // filings under the selected (top-N) titles
  distinctTitles: number  // distinct normalized titles seen before top-N selection
}

/**
 * Title ↔ SOC conflation matrix from the all-SOC LCA stream. Normalizes each JOB_TITLE (rank
 * stripped), counts filings per (title, soc), then emits the top-N titles by volume with their SOC
 * distribution. Deterministic tie-breaks by name/code throughout. Pure — no IO.
 */
export function aggregateConflation(
  records: readonly { title: string; soc: string }[],
  opts: Partial<{ topTitles: number; topSocs: number; minFilings: number }> = {},
): ConflationAgg {
  const { topTitles = 40, topSocs = 6, minFilings = 50 } = opts

  const byTitle = new Map<string, Map<string, number>>() // title -> soc -> filings
  const titleTotal = new Map<string, number>()
  for (const r of records) {
    const t = normalizeTitle(r.title)
    if (!t) continue
    let socs = byTitle.get(t)
    if (!socs) { socs = new Map<string, number>(); byTitle.set(t, socs) }
    socs.set(r.soc, (socs.get(r.soc) ?? 0) + 1)
    titleTotal.set(t, (titleTotal.get(t) ?? 0) + 1)
  }

  const selected = [...titleTotal.entries()]
    .filter(([, n]) => n >= minFilings)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topTitles)

  const titles: ConflationTitle[] = selected.map(([title, total]) => {
    const socEntries = [...byTitle.get(title)!.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    const socs: ConflationSoc[] = socEntries.slice(0, topSocs)
      .map(([soc, n]) => ({ soc, filings: n, share: n / total }))
    const restFilings = socEntries.slice(topSocs).reduce((s, [, n]) => s + n, 0)
    if (restFilings > 0) socs.push({ soc: 'other', filings: restFilings, share: restFilings / total })
    return { title, filings: total, socCount: socEntries.length, socs }
  })

  return {
    titles,
    totalFilings: titles.reduce((s, t) => s + t.filings, 0),
    distinctTitles: byTitle.size,
  }
}
