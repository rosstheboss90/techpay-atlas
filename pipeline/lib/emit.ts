import type { SalaryRecord } from './parse-oews'
import type { EmployerBundle } from './aggregate'
import { ROLES, type Role } from './soc'

export interface MetroMeta { cbsa: string; name: string; state: string; lat: number; lng: number; rpp: number | null }
export interface Meta { year: number; generated: string | null; metros: MetroMeta[]; roles: Role[] }
export type SalariesJson = Record<string, Record<string, Omit<SalaryRecord, 'cbsa' | 'soc'>>>

/** `generated` is stamped by run.ts at write time — builders stay pure and tests stay time-free. */
export function buildMeta(
  salaries: SalaryRecord[],
  areas: Map<string, { name: string; state: string }>,
  coords: Map<string, { lat: number; lng: number }>,
  rpp: Map<string, number>,
  year: number,
): { meta: Meta; dropped: string[] } {
  const cbsas = [...new Set(salaries.map(s => s.cbsa))].sort()
  const metros: MetroMeta[] = []
  const dropped: string[] = []
  for (const cbsa of cbsas) {
    const area = areas.get(cbsa), c = coords.get(cbsa)
    if (!area || !c) { dropped.push(cbsa); continue } // no name or no coords -> cannot render on the map
    metros.push({ cbsa, name: area.name, state: area.state, lat: c.lat, lng: c.lng, rpp: rpp.get(cbsa) ?? null })
  }
  return { meta: { year, generated: null, metros, roles: ROLES }, dropped }
}

export function buildSalaries(salaries: SalaryRecord[]): SalariesJson {
  const out: SalariesJson = {}
  const sorted = [...salaries].sort((a, b) => a.cbsa.localeCompare(b.cbsa) || a.soc.localeCompare(b.soc))
  for (const { cbsa, soc, ...rest } of sorted) (out[cbsa] ??= {})[soc] = rest
  return out
}

export function buildEmployerFiles(agg: Map<string, Map<string, EmployerBundle>>):
  { cbsa: string; body: { cbsa: string; roles: Record<string, EmployerBundle> } }[] {
  return [...agg.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cbsa, bySoc]) => ({
    cbsa,
    body: { cbsa, roles: Object.fromEntries([...bySoc.entries()].sort(([a], [b]) => a.localeCompare(b))) },
  }))
}
