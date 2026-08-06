import type { TrendsJson } from './trends-types'

export interface RankedRole { soc: string; label: string; short: string; changeReal: number }
export interface PathPoint { year: number; value: number }

/** Roles ordered by real change over the headline window, largest gain first.
 *
 *  No role is excluded: the headline window starts at the first year every role exists as its own
 *  SOC code, so every bar spans an identical period and the ranking is comparable throughout. */
export function rankByChange(t: TrendsJson): RankedRole[] {
  return Object.entries(t.roles)
    .map(([soc, r]) => ({ soc, label: r.label, short: r.short, changeReal: r.changeReal }))
    .sort((a, b) => b.changeReal - a.changeReal)
}

/** Real-dollar points for one role, leading nulls dropped so the line begins where its data does.
 *
 *  Eight roles start in 2021 because BLS did not publish them as separate codes before then —
 *  a classification fact, not a pay fact. `TrendsRole.firstYear` carries that per role if a view
 *  ever needs to annotate it; nothing does today, so there is no accessor for it. */
export function pathPoints(t: TrendsJson, soc: string): PathPoint[] {
  const role = t.roles[soc]
  if (!role) return []
  const out: PathPoint[] = []
  role.real.forEach((v, i) => { if (v !== null) out.push({ year: t.years[i], value: v }) })
  return out
}

/** [min, max] real value across all roles, so every path shares one y-axis and the ghosted
 *  lines stay comparable to the highlighted one. */
export function realDomain(t: TrendsJson): [number, number] {
  const vals = Object.values(t.roles).flatMap(r => r.real).filter((v): v is number => v !== null)
  return [Math.min(...vals), Math.max(...vals)]
}
