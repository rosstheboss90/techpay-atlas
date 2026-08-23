import type { Meta, Metric, MetroMeta, Salaries } from './types'
import type { TitlesJson } from './title-types'
import type { TrendsJson } from './trends-types'
import { fmtUsd } from './format'
import { metricValue } from './derive'
import { similarByPay } from './role-similarity'
import { slopeRows, SLOPE_N, type SlopeRow } from './slopegraph'

/** First city of a CBSA title: "San Jose-Sunnyvale-Santa Clara, CA" → "San Jose". */
export function shortMetro(name: string): string {
  return name.split(/[-,]/)[0].trim()
}

/** The mobile question index's structured fact/context pair. `context` is always `''` as of the
 *  v2.1 full-sentence pass (the fact absorbed it) — the field stays for shape compatibility.
 *  Never states a number the expanded section doesn't show with its caveats (honesty rule — see
 *  the 2026-08-10 restructure spec and its 2026-08-11 Amendment v2.1).
 *  `context` is `''` as of v2.1 — field retained for shape stability; the card renders it only
 *  when non-empty. */
export interface Teaser { fact: string; context: string }

/** Answer-first card content for the mobile question index. Each is pure, tolerates missing data,
 *  returns one complete sentence in `fact` (`context` is always `''`), and never states a number
 *  the expanded section doesn't show with its caveats (honesty rule — see the 2026-08-10
 *  restructure spec and its 2026-08-11 Amendment v2.1). */

export function titleTeaser(titles: TitlesJson | null, soc: string, roleLabel: string): Teaser {
  const top = titles?.families
    .flatMap(f => f.buckets)
    .filter(b => b.socMix[0]?.soc === soc)
    .sort((a, b) => b.national.filings - a.national.filings)[0]
  return top
    ? { fact: `Job ads say “${top.label}” — the statistics say ${roleLabel}.`, context: '' }
    : { fact: 'Real titles, mapped to the official codes.', context: '' }
}

export function payTeaser(
  salaries: Salaries, metros: MetroMeta[], soc: string, adjusted: boolean,
): Teaser & { top3: { city: string; p50: number }[] } {
  // The quoted number must be one the expanded section shows: the map/panel display each metro's
  // own p50, never a national median — so the teaser quotes the top metro's own median. It must
  // also agree with the MAP's current colouring, so in adjusted mode both the ranking and the
  // printed figure use the RPP-adjusted value (metricValue is the same helper the map uses).
  const withP50: { name: string; v: number }[] = []
  for (const m of metros) {
    const v = metricValue(salaries[m.cbsa]?.[soc], m, 'pay', adjusted)
    if (v != null) withP50.push({ name: m.name, v })
  }
  if (withP50.length === 0) {
    return { fact: 'Percentiles for every metro on the map.', context: '', top3: [] }
  }
  const sorted = [...withP50].sort((a, b) => b.v - a.v)
  const top = sorted[0]
  const top3 = sorted.slice(0, 3).map(m => ({ city: shortMetro(m.name), p50: Math.round(m.v) }))
  return {
    fact: `${shortMetro(top.name)} tops the map at ${fmtUsd(Math.round(top.v))}.`,
    context: '',
    top3,
  }
}

export function colTeaser(metros: MetroMeta[], salaries: Salaries, soc: string, metric: Metric): Teaser {
  const fallback: Teaser = { fact: 'See who leapfrogs whom once cost of living counts.', context: '' }
  if (metric !== 'pay') return fallback
  const worst = slopeRows(metros, salaries, soc, SLOPE_N)
    .reduce<SlopeRow | null>((acc, r) => (r.delta < (acc?.delta ?? 0) ? r : acc), null)
  if (worst == null) return fallback
  const n = -worst.delta
  return {
    fact: `${shortMetro(worst.name)} falls ${n} place${n === 1 ? '' : 's'} once cost of living counts.`,
    context: '',
  }
}

export function trendTeaser(trends: TrendsJson | null, soc: string, roleLabel: string): Teaser {
  const role = trends?.roles[soc]
  if (!role) return { fact: 'Trend data unavailable.', context: '' }
  const pct = role.changeReal * 100
  const verb = pct >= 0 ? 'up' : 'down'
  return {
    fact: `${roleLabel} are ${verb} ${Math.abs(pct).toFixed(1)}% in real terms since ${trends!.headlineFrom}.`,
    context: '',
  }
}

export function similarTeaser(
  meta: Meta, salaries: Salaries, soc: string,
): Teaser & { topLabel: string | null; count: number } {
  // similarByPay only omits a role when it shares zero metros with the anchor — thin (< MIN_SHARED)
  // pairs are still returned, just labeled `thin: true`. The site's honesty rule is "label, never
  // hide" (see THIN_SAMPLE_FILINGS in title-types.ts): the similar-roles section lists thin rows
  // with a chip rather than dropping them, so the teaser counts everything the section will show.
  // `count` mirrors that same n back out (0 in the fallback) so the page's "+N more" viz chip can
  // derive its number from the data, never by parsing `fact`.
  const rows = similarByPay(meta, salaries, soc)
  const n = rows.length
  if (n === 0) return { fact: 'Not enough overlap to compare this role.', context: '', topLabel: null, count: 0 }
  return {
    fact: `${n} role${n === 1 ? '' : 's'} pay${n === 1 ? 's' : ''} like this one.`,
    context: '',
    topLabel: rows[0].label,
    count: n,
  }
}
