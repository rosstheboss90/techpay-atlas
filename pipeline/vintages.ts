/** Single source of truth for which vintage of each upstream source is current.
 *  Bumping a data refresh should be an edit to THIS FILE and nothing else.
 *  See docs/REFRESH.md for the runbook. */
export const VINTAGES = {
  /** OEWS reference year — the "May <year>" release. Drives both the MSA and national files. */
  oewsYear: 2025,
  /** Previous OEWS year, used as a download fallback when the current year has not published. */
  oewsFallbackYear: 2024,
  /** DOL LCA disclosure fiscal year (quarters Q1–Q4 of this FY). */
  lcaFiscalYear: 2025,
  /** Census Gazetteer vintage year. */
  gazetteerYear: 2025,
  /** Previous Gazetteer year, download fallback. */
  gazetteerFallbackYear: 2024,
  /** HUD ZIP–CBSA crosswalk stamp, MMYYYY as HUD's own filenames encode it. */
  hudStamp: '032026',
  /** Previous HUD stamp, download fallback. */
  hudFallbackStamp: '122025',
} as const

/** National OEWS vintages archived for the /trends time series.
 *  Spec Decision 1: the window is May 2019 -> current. */
export const OEWS_NAT_YEARS: readonly number[] =
  Array.from({ length: VINTAGES.oewsYear - 2019 + 1 }, (_, i) => 2019 + i)

/** BLS substitutes `#` for a percentile wage at or above its annual top code, and that threshold
 *  is VINTAGE-SPECIFIC — so reading an old file with a current constant would rewrite that year's
 *  censored cells. That is why the value is per-year and why each archive file records its own.
 *
 *  VERIFIED 2026-08-06 by measuring the largest UNCENSORED H_PCT90 in each national vintage. BLS
 *  censors at a round hourly figure, so that maximum lands just under the true ceiling:
 *
 *    vintage | max uncensored H_PCT90 | implied hourly cap | annual
 *    2019    |  98.90                 | $100.00            | 208,000
 *    2020    |  99.92                 | $100.00            | 208,000
 *    2021    |  99.72                 | $100.00            | 208,000
 *    2022    | 112.97                 | $115.00            | 239,200
 *    2023    | 112.31                 | $115.00            | 239,200
 *    2024    | 113.34                 | $115.00            | 239,200
 *    2025    | 349.35, and ZERO `#` cells in the whole file — no censoring applied at all
 *
 *  ⚠️ The boundary is **May 2022**, not 2023. An earlier guess here said 2023 and was wrong, which
 *  archived `11-3021`'s 2022 p90 as 208,000 instead of 239,200 — a 15% understatement that showed
 *  up as a fake step in 2023. That is exactly the artifact this per-year table exists to prevent,
 *  so it is worth restating: DO NOT guess these, measure them.
 *
 *  This matters more than a first pass suggested. Registry SOCs are never censored in the 2025 MSA
 *  file, which made the whole mechanism look inert — but in the NATIONAL files `11-3021` (IT
 *  Managers) has a censored p90 in every vintage 2019–2024, and `15-1221` in 2021. Any p90 series
 *  for those roles is a floor, not a value; the archive's `capped` array marks exactly which.
 *
 *  2025's entry is unused (nothing is censored) and is kept only so `topCodeForYear` does not throw.
 *  The true 2025 ceiling, if any, is above $742,310 nationally / $929,520 in the MSA file.
 *
 *  To re-verify after a refresh: max uncensored H_PCT90 per vintage, per the table above.
 *  Cross-check against BLS OEWS technical notes, bls.gov/oes/<year>/may/oes_tec.htm. */
const OEWS_TOP_CODE_BY_YEAR: Readonly<Record<number, number>> = {
  2019: 208_000,
  2020: 208_000,
  2021: 208_000,
  2022: 239_200, // boundary — BLS raised the cap from $100.00/hr to $115.00/hr in May 2022
  2023: 239_200,
  2024: 239_200,
  2025: 239_200, // unused: the 2025 file has zero `#` cells
}

/** Throws rather than defaulting: an unrecorded vintage must fail loudly, never silently
 *  inherit another year's ceiling. */
export function topCodeForYear(year: number): number {
  const v = OEWS_TOP_CODE_BY_YEAR[year]
  if (v === undefined) throw new Error(`no OEWS top code recorded for vintage ${year} — add it to pipeline/vintages.ts`)
  return v
}
