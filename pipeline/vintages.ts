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
 *  ⚠️ THESE VALUES ARE NOT THE REAL THRESHOLDS, and for this project it does not matter. Measured
 *  2026-08-06 against the local May 2025 MSA file (150,023 rows):
 *
 *    - Only 212 cells in the whole file are `#`, and every one is a physician / anesthetist
 *      occupation (29-xxxx).
 *    - **Zero `#` cells occur in any of the 21 registry SOCs** (5,371 rows), across all ten
 *      percentile columns. The highest registry A_PCT90 is $430,840, published as a real number.
 *    - The real ceiling is far above $239,200: the file publishes A_PCT90 up to $929,520
 *      ($446.89/hr, Chief Executives). BLS's long-standing documented footnote reads "$100.00 per
 *      hour or $208,000 per year", so the threshold has clearly been raised and the current value
 *      must be read from the technical notes, not assumed.
 *
 *  Consequence: `topCodeForYear` is never actually consulted for a tech role, because no tech cell
 *  is censored. The numbers below are placeholders of the right SHAPE. Do not trust them as facts,
 *  and do not spend effort verifying them unless a vintage turns up with a non-empty `capped`
 *  array for a registry SOC — `archive-verify` reports that, and it is the only signal that would
 *  make the true threshold matter.
 *
 *  Authoritative source if it ever does: BLS OEWS technical notes,
 *  bls.gov/oes/current/oes_tec.htm (or bls.gov/oes/<year>/may/oes_tec.htm for an older release). */
const OEWS_TOP_CODE_BY_YEAR: Readonly<Record<number, number>> = {
  2019: 208_000,
  2020: 208_000,
  2021: 208_000,
  2022: 208_000,
  2023: 239_200,
  2024: 239_200,
  2025: 239_200,
}

/** Throws rather than defaulting: an unrecorded vintage must fail loudly, never silently
 *  inherit another year's ceiling. */
export function topCodeForYear(year: number): number {
  const v = OEWS_TOP_CODE_BY_YEAR[year]
  if (v === undefined) throw new Error(`no OEWS top code recorded for vintage ${year} — add it to pipeline/vintages.ts`)
  return v
}
