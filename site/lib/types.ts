// trendYears is optional rather than required: Phase B Task 5 (the pipeline stamp) is blocked on
// data acquisition and hasn't shipped, so production meta.json does not carry it yet. Treating it
// as absent-means-zero (`metro.trendYears ?? 0`, see MetroPanel) keeps the panel's skip-fetch guard
// correct in the meantime, and avoids forcing every other test fixture in this file's blast radius
// to grow a field it has no reason to know about yet.
export interface MetroMeta { cbsa: string; name: string; state: string; lat: number; lng: number; rpp: number | null; lcaFilings: number; trendYears?: number }
export interface Role { soc: string; label: string; short: string }
export interface Meta {
  year: number; generated: string; metros: MetroMeta[]; roles: Role[]
  topCodeValue: number; rppYear: number; lcaPeriod: string
  sources: { oews: string; lca: string[]; hud: string; zipMatchRate: number }
}
export type Pct = 'p10' | 'p25' | 'p50' | 'p75' | 'p90'
export interface SalaryRow { emp: number | null; lq: number | null; p10: number | null; p25: number | null; p50: number | null; p75: number | null; p90: number | null; capped?: Pct[] }
export type Salaries = Record<string, Record<string, SalaryRow>>   // cbsa -> soc -> row
export interface EmployerStat { name: string; filings: number; median: number }
export interface EmployerBundle { employers: EmployerStat[]; sample: number[]; n: number; p99: number }
export interface EmployerFile { cbsa: string; roles: Record<string, EmployerBundle> }
export type Metric = 'pay' | 'emp' | 'lq'
