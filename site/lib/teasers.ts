import type { Meta, Metric, MetroMeta, Salaries } from './types'
import type { TitlesJson } from './title-types'
import type { TrendsJson } from './trends-types'
import { fmtUsd } from './format'
import { similarByPay } from './role-similarity'
import { slopeRows, SLOPE_N, type SlopeRow } from './slopegraph'

/** First city of a CBSA title: "San Jose-Sunnyvale-Santa Clara, CA" → "San Jose". */
export function shortMetro(name: string): string {
  return name.split(/[-,]/)[0].trim()
}

/** One-line answers for the mobile question index. Each is pure, tolerates missing data,
 *  and never states a number the expanded section doesn't show with its caveats
 *  (honesty rule — see the 2026-08-10 restructure spec). */

export function titleTeaser(titles: TitlesJson | null, soc: string, roleLabel: string): string {
  const top = titles?.families
    .flatMap(f => f.buckets)
    .filter(b => b.socMix[0]?.soc === soc)
    .sort((a, b) => b.national.filings - a.national.filings)[0]
  return top
    ? `Called “${top.label}”? BLS counts you as ${roleLabel}`
    : 'See what these jobs are really called'
}

export function payTeaser(trends: TrendsJson | null, salaries: Salaries, metros: MetroMeta[], soc: string): string {
  const series = trends?.roles[soc]?.nominal
  const latest = series ? [...series].reverse().find((v): v is number => v != null) ?? null : null
  let top: { name: string; v: number } | null = null
  for (const m of metros) {
    const v = salaries[m.cbsa]?.[soc]?.p50
    if (v != null && (top == null || v > top.v)) top = { name: m.name, v }
  }
  if (latest != null && top) return `${fmtUsd(latest)} national median · ${shortMetro(top.name)} tops the map`
  if (top) return `${shortMetro(top.name)} tops the map`
  return 'Percentiles for every metro on the map'
}

export function colTeaser(metros: MetroMeta[], salaries: Salaries, soc: string, metric: Metric): string {
  if (metric !== 'pay') return 'See who leapfrogs whom once cost of living counts'
  const worst = slopeRows(metros, salaries, soc, SLOPE_N)
    .reduce<SlopeRow | null>((acc, r) => (r.delta < (acc?.delta ?? 0) ? r : acc), null)
  if (worst == null) return 'See who leapfrogs whom once cost of living counts'
  const n = -worst.delta
  return `${shortMetro(worst.name)} falls ${n} place${n === 1 ? '' : 's'} once cost of living counts`
}

export function trendTeaser(trends: TrendsJson | null, soc: string): string {
  const role = trends?.roles[soc]
  if (!role) return 'Trend data unavailable'
  const pct = role.changeReal * 100
  const sign = pct >= 0 ? '+' : '−'
  return `${sign}${Math.abs(pct).toFixed(1)}% in real terms since ${trends!.headlineFrom}`
}

export function similarTeaser(meta: Meta, salaries: Salaries, soc: string): string {
  // similarByPay only omits a role when it shares zero metros with the anchor — thin (< MIN_SHARED)
  // pairs are still returned, just labeled `thin: true`. The site's honesty rule is "label, never
  // hide" (see THIN_SAMPLE_FILINGS in title-types.ts): the similar-roles section lists thin rows
  // with a chip rather than dropping them, so the teaser counts everything the section will show.
  const n = similarByPay(meta, salaries, soc).length
  return n === 0
    ? 'Not enough overlap to compare this role'
    : `${n} role${n === 1 ? '' : 's'} pay${n === 1 ? 's' : ''} like this one`
}
