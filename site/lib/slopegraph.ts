import type { MetroMeta, Salaries } from './types'
import { adjust } from './derive'

export interface SlopeRow {
  cbsa: string
  name: string
  nominal: number       // p50, filed
  adjusted: number      // p50 expressed in cost-of-living-adjusted dollars
  nominalRank: number   // 1-based, within the shown subset, by nominal pay desc
  adjustedRank: number  // 1-based, within the subset, by adjusted pay desc
  delta: number         // nominalRank − adjustedRank; > 0 rose under adjustment, < 0 fell
  capped: boolean       // p50 is top-coded
}

/** Top-N metros the slopegraph section shows — teasers must describe the same subset. */
export const SLOPE_N = 18

/**
 * Top-N metros by nominal median pay for a role, each carrying its nominal and COL-adjusted rank
 * **within this subset** (both columns therefore span 1..length). Rank basis is the shown set, not
 * the nation — the chart answers "who leapfrogs whom among the top payers." Metros without a
 * cost-of-living index (`rpp == null`) or without a `p50` are excluded — they have no adjusted
 * position. Stable tie-break by metro name throughout.
 */
export function slopeRows(metros: MetroMeta[], salaries: Salaries, soc: string, n: number): SlopeRow[] {
  const base = metros
    .map(m => {
      const row = salaries[m.cbsa]?.[soc]
      const nominal = row?.p50 ?? null
      const adjusted = adjust(nominal, m.rpp, true)
      if (nominal == null || adjusted == null) return null
      return { cbsa: m.cbsa, name: m.name, nominal, adjusted, capped: !!row?.capped?.includes('p50') }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)

  const top = [...base]
    .sort((a, b) => b.nominal - a.nominal || a.name.localeCompare(b.name))
    .slice(0, n)

  const adjustedRankOf = new Map(
    [...top].sort((a, b) => b.adjusted - a.adjusted || a.name.localeCompare(b.name))
      .map((r, i) => [r.cbsa, i + 1] as const),
  )

  return top.map((r, i) => {
    const nominalRank = i + 1
    const adjustedRank = adjustedRankOf.get(r.cbsa)!
    return { ...r, nominalRank, adjustedRank, delta: nominalRank - adjustedRank }
  })
}
