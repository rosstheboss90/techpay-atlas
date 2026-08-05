import type { Meta, Salaries } from './types'

/** Below this many shared metros a pair's overlap rests on thin evidence and is labeled + demoted. */
export const MIN_SHARED = 40

/** Median of a non-empty numeric array (average of the two middles for even length). */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export interface RoleSim {
  soc: string
  label: string
  overlap: number      // median over shared metros of min/max p50 ratio ∈ (0,1]; 1 = pays identically
  ratio: number        // median p50(anchor) / p50(other); > 1 means the anchor pays more
  shared: number       // shared-metro count
  repMedian: number    // this role's representative pay: median p50 across its metros
  thin: boolean        // shared < MIN_SHARED
}

/** Median p50 across every metro that has this role. Null when the role appears nowhere. */
function repMedian(salaries: Salaries, metroCbsas: string[], soc: string): number | null {
  const vals: number[] = []
  for (const cbsa of metroCbsas) {
    const p = salaries[cbsa]?.[soc]?.p50
    if (p != null) vals.push(p)
  }
  return vals.length ? median(vals) : null
}

/**
 * For the anchor role, the other roles ranked by pay-equivalency: the median across shared metros
 * of `min(p50) / max(p50)` (1 = paid identically everywhere). COL-invariant — both roles share the
 * metro, so its RPP cancels in the per-metro ratio. Sorted overlap desc; thin pairs (few shared
 * metros) demoted at equal overlap. Excludes the anchor itself.
 */
export function similarByPay(meta: Meta, salaries: Salaries, anchor: string): RoleSim[] {
  const cbsas = meta.metros.map(m => m.cbsa)
  const out: RoleSim[] = []
  for (const role of meta.roles) {
    if (role.soc === anchor) continue
    const ratios: number[] = []   // min/max per shared metro
    const dir: number[] = []      // anchor/other per shared metro
    for (const cbsa of cbsas) {
      const a = salaries[cbsa]?.[anchor]?.p50
      const b = salaries[cbsa]?.[role.soc]?.p50
      if (a == null || b == null || a <= 0 || b <= 0) continue
      ratios.push(Math.min(a, b) / Math.max(a, b))
      dir.push(a / b)
    }
    const rep = repMedian(salaries, cbsas, role.soc)
    if (ratios.length === 0 || rep == null) continue
    out.push({
      soc: role.soc, label: role.label,
      overlap: median(ratios), ratio: median(dir),
      shared: ratios.length, repMedian: rep, thin: ratios.length < MIN_SHARED,
    })
  }
  // Overlap desc; at (near-)equal overlap, well-supported pairs before thin ones; stable by label.
  return out.sort((x, y) =>
    (y.overlap - x.overlap) || (Number(x.thin) - Number(y.thin)) || x.label.localeCompare(y.label))
}
