import type { EmployerFile, Meta, Salaries } from './types'
import type { TitlesJson } from './title-types'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} loading ${path}`)
  return res.json() as Promise<T>
}

export const loadMeta = () => get<Meta>('/data/meta.json')
export const loadSalaries = () => get<Salaries>('/data/salaries.json')
export const loadEmployers = (cbsa: string) => get<EmployerFile>(`/data/employers/${cbsa}.json`)
export const loadTitles = () => get<TitlesJson>('/data/titles.json')
