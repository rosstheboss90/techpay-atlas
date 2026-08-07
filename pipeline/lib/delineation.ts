import type { MsaArchive } from './history'

export interface MetroDelineation {
  /** Years in which this metro's AREA_TITLE differs from the previous year it appeared.
   *  A break means the series must not be drawn across this year. */
  breaks: number[]
  firstYear: number
  lastYear: number
  /** Years inside [firstYear, lastYear] where the metro is absent from the vintage entirely.
   *
   *  DIAGNOSTIC ONLY — the splitter does not read this. An absent metro already yields a null in
   *  buildMetroTrend (`a.metros[cbsa]?.` misses), and `segments()` splits on nulls, so absence is
   *  handled without a second mechanism. This field exists so the emit step can report coverage
   *  holes; do not add a code path that splits on it as well, or gaps get counted twice. */
  absentYears: number[]
}

/** Per-CBSA continuity facts, derived from AREA_TITLE changes across vintages.
 *
 *  ⚠️ This is a HEURISTIC, deliberately. OMB can move a county boundary without renaming the
 *  metro, and can rename cosmetically without moving one. The honest alternative — ingesting OMB's
 *  delineation files and diffing county composition — is an entire additional dataset for a
 *  marginal gain over a signal that catches the large, real redefinitions. The page says the
 *  detection is title-based rather than implying more rigour than it has. */
export function detectDelineation(archives: readonly MsaArchive[]): Record<string, MetroDelineation> {
  const sorted = [...archives].sort((a, b) => a.year - b.year)
  const seen: Record<string, { title: string; years: number[]; breaks: number[] }> = {}

  for (const v of sorted) {
    for (const [cbsa, title] of Object.entries(v.areas)) {
      const prev = seen[cbsa]
      if (!prev) { seen[cbsa] = { title, years: [v.year], breaks: [] }; continue }
      if (prev.title !== title) prev.breaks.push(v.year)
      prev.title = title
      prev.years.push(v.year)
    }
  }

  const out: Record<string, MetroDelineation> = {}
  for (const [cbsa, s] of Object.entries(seen)) {
    const firstYear = s.years[0]
    const lastYear = s.years[s.years.length - 1]
    const present = new Set(s.years)
    const absentYears = sorted
      .map(v => v.year)
      .filter(y => y > firstYear && y < lastYear && !present.has(y))
    out[cbsa] = { breaks: s.breaks, firstYear, lastYear, absentYears }
  }
  return out
}
