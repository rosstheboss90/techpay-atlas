// Mirrors pipeline/build-trends.ts's TrendsJson contract verbatim (site/public/data/trends.json).
// The site cannot import from pipeline/ (static export, no backend), so this is a deliberate
// duplicate type, same reason title-types.ts exists.

export interface TrendsRole {
  label: string
  short: string
  firstYear: number
  nominal: (number | null)[]       // index-aligned to TrendsJson.years
  real: (number | null)[]          // base-year dollars, index-aligned to TrendsJson.years; already deflated
  emp: (number | null)[]
  cappedP90: boolean[]
  changeReal: number
}

export interface TrendsJson {
  years: number[]
  headlineFrom: number
  headlineTo: number
  deflator: { series: string; period: string; base: number }
  roles: Record<string, TrendsRole>
  skippedRoles: string[]
  breaks: { year: number; note: string }[]
}
