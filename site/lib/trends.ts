import type { TrendsJson } from './trends-types'

export interface RankedRole { soc: string; label: string; short: string; changeReal: number }
export interface PathPoint { year: number; value: number }

/** 'real' = base-year dollars (comparison-safe, but nobody was ever paid the 2021 figure).
 *  'nominal' = the dollar amount actually reported that year (what a reader recognizes, but not
 *  comparable across years without doing the inflation math themselves). Every function below
 *  defaults to 'real' so pre-toggle callers and tests keep their existing behaviour untouched. */
export type ValueMode = 'real' | 'nominal'

/** Roles ordered by real change over the headline window, largest gain first.
 *
 *  No role is excluded: the headline window starts at the first year every role exists as its own
 *  SOC code, so every bar spans an identical period and the ranking is comparable throughout.
 *
 *  Deliberately real-only, with no mode parameter: a "nominal change" ranking would be a
 *  different and misleading claim (paychecks went up nearly everywhere in nominal terms, which
 *  says nothing about keeping pace with inflation). The nominal/real toggle on the page applies
 *  only to the path chart and table, never to this ranking. */
export function rankByChange(t: TrendsJson): RankedRole[] {
  return Object.entries(t.roles)
    .map(([soc, r]) => ({ soc, label: r.label, short: r.short, changeReal: r.changeReal }))
    .sort((a, b) => b.changeReal - a.changeReal)
}

/** Dollar points for one role in the given mode, leading nulls dropped so the line begins where
 *  its data does.
 *
 *  Eight roles start in 2021 because BLS did not publish them as separate codes before then —
 *  a classification fact, not a pay fact. `TrendsRole.firstYear` carries that per role if a view
 *  ever needs to annotate it; nothing does today, so there is no accessor for it. */
export function pathPoints(t: TrendsJson, soc: string, mode: ValueMode = 'real'): PathPoint[] {
  const role = t.roles[soc]
  if (!role) return []
  const series = mode === 'nominal' ? role.nominal : role.real
  const out: PathPoint[] = []
  series.forEach((v, i) => { if (v !== null) out.push({ year: t.years[i], value: v }) })
  return out
}

/** [min, max] value across all roles in the given mode, so every path shares one y-axis and the
 *  ghosted lines stay comparable to the highlighted one. Real and nominal domains differ — the
 *  nominal figures are never deflated, so they land on their own span. */
export function valueDomain(t: TrendsJson, mode: ValueMode = 'real'): [number, number] {
  const vals = Object.values(t.roles)
    .flatMap(r => mode === 'nominal' ? r.nominal : r.real)
    .filter((v): v is number => v !== null)
  return [Math.min(...vals), Math.max(...vals)]
}

/** The most recent year a role has a reported nominal figure, and that figure — the "what does
 *  this job pay right now" number a reader actually wants, as distinct from a base-year-deflated
 *  one. Walks from the end of the series rather than assuming the last index is populated, since
 *  a role could in principle lag the dataset's most recent year. */
export function latestNominal(t: TrendsJson, soc: string): { year: number; value: number } | null {
  const role = t.roles[soc]
  if (!role) return null
  for (let i = role.nominal.length - 1; i >= 0; i--) {
    const v = role.nominal[i]
    if (v !== null) return { year: t.years[i], value: v }
  }
  return null
}
