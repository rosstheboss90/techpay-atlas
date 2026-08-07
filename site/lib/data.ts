import type { EmployerFile, Meta, Salaries } from './types'
import type { TitlesJson } from './title-types'
import type { TrendsJson } from './trends-types'
import type { EmployerHeadJson, EmployerIndexShard, EmployerProfileJson } from './employer-types'
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
export const loadEmployerHead = () => get<EmployerHeadJson>(`${BASE}/data/employer-head.json`)
/** `shard` is the first character of a slug. run.ts asserts no empty slug is ever emitted, so
 *  every shard that exists is named [a-z0-9]. */
export const loadEmployerIndex = (shard: string) =>
  get<EmployerIndexShard>(`${BASE}/data/employer-index/${shard}.json`)
export const loadEmployerProfile = (slug: string) =>
  get<EmployerProfileJson>(`${BASE}/data/employers-by-name/${slug}.json`)
