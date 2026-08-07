import type { EmployerFile, Meta, Salaries } from './types'
import type { TitlesJson } from './title-types'
import type { TrendsJson } from './trends-types'
import type { MetroTrendData } from './metro-trend-types'

// Inlined at build time; set by the Pages workflow, empty for dev/local builds.
// Must match next.config.ts basePath — Next does not rewrite fetch() URLs.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} loading ${path}`)
  return res.json() as Promise<T>
}

export const loadMeta = () => get<Meta>(`${BASE}/data/meta.json`)
export const loadSalaries = () => get<Salaries>(`${BASE}/data/salaries.json`)
export const loadEmployers = (cbsa: string) => get<EmployerFile>(`${BASE}/data/employers/${cbsa}.json`)
export const loadTitles = () => get<TitlesJson>(`${BASE}/data/titles.json`)
export const loadTrends = () => get<TrendsJson>(`${BASE}/data/trends.json`)
export const loadMetroTrend = (cbsa: string) => get<MetroTrendData>(`${BASE}/data/trends/${cbsa}.json`)
