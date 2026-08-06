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

/** BLS substitutes `#` for a percentile wage at or above its annual top code, and that
 *  threshold is VINTAGE-SPECIFIC. Reading an old file with the current constant silently
 *  rewrites that year's censored cells (spec trap T2).
 *
 *  ⚠️ VERIFY THESE AGAINST THE DOWNLOADED FILES — Task 9 of the implementation plan does this.
 *  The values below are the expected shape ($208,000 early, $239,200 later); the year at which
 *  the threshold changed has NOT been confirmed against BLS's technical notes. */
const OEWS_TOP_CODE_BY_YEAR: Readonly<Record<number, number>> = {
  2019: 208_000,
  2020: 208_000,
  2021: 208_000,
  2022: 208_000,
  2023: 239_200, // ⚠️ UNVERIFIED boundary — see Task 9
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
