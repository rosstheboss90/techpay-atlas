import type { Pct, SalaryRecord } from './parse-oews'
import type { EmployerBundle } from './aggregate'
import type { aggregateTitles } from './aggregate-titles'
import type { ConflationAgg } from './aggregate-conflation'
import { ROLES, type Role } from './soc'
import { TOP_CODE } from './num'

/** `trendYears` is OPTIONAL on purpose. Absent means no MSA archive existed when the pipeline ran,
 *  so the metro-trend feature is not live and the site renders nothing for it. 0 means the archive
 *  existed and this metro genuinely has no published history. Making it required would erase that
 *  distinction, and every metro would claim "no published history" whenever the archive is missing. */
export interface MetroMeta { cbsa: string; name: string; state: string; lat: number; lng: number; rpp: number | null; lcaFilings: number; trendYears?: number }
export interface Meta {
  year: number; generated: string | null; metros: MetroMeta[]; roles: Role[]
  topCodeValue: number; rppYear: number
  lcaPeriod: string
  sources: { oews: string; lca: string[]; hud: string; zipMatchRate: number }
}
type SalaryRow = Omit<SalaryRecord, 'cbsa' | 'soc' | 'capped'> & { capped?: Pct[] }
export type SalariesJson = Record<string, Record<string, SalaryRow>>

/** `generated`, `lcaPeriod`, and `sources` are stamped by run.ts at write time — those are
 *  pipeline-run provenance (filenames, timestamps, final match rate), not derivable from the
 *  salary/area/rpp inputs buildMeta receives. Builders stay pure and tests stay time-free. */
export function buildMeta(
  salaries: SalaryRecord[],
  areas: Map<string, { name: string; state: string }>,
  coords: Map<string, { lat: number; lng: number }>,
  rpp: { year: number; values: Map<string, number> },
  year: number,
  filingsByCbsa: Map<string, number>,
): { meta: Meta; droppedNoArea: string[]; droppedNoCoords: string[] } {
  const cbsas = [...new Set(salaries.map(s => s.cbsa))].sort()
  const metros: MetroMeta[] = []
  const droppedNoArea: string[] = []
  const droppedNoCoords: string[] = []
  for (const cbsa of cbsas) {
    const area = areas.get(cbsa), c = coords.get(cbsa)
    if (!area) { droppedNoArea.push(cbsa); continue }
    if (!c) { droppedNoCoords.push(cbsa); continue } // no coords -> cannot render on the map
    metros.push({
      cbsa, name: area.name, state: area.state, lat: c.lat, lng: c.lng,
      rpp: rpp.values.get(cbsa) ?? null, lcaFilings: filingsByCbsa.get(cbsa) ?? 0,
    })
  }
  return {
    meta: {
      year, generated: null, metros, roles: ROLES, topCodeValue: TOP_CODE, rppYear: rpp.year,
      lcaPeriod: '', sources: { oews: '', lca: [], hud: '', zipMatchRate: 0 },
    },
    droppedNoArea, droppedNoCoords,
  }
}

export function buildSalaries(salaries: SalaryRecord[], keep: Set<string>): { salaries: SalariesJson; excluded: number } {
  const out: SalariesJson = {}
  let excluded = 0
  const accepted = salaries.filter(s => {
    if (!keep.has(s.cbsa)) { excluded++; return false }
    return true
  })
  const sorted = accepted.sort((a, b) => a.cbsa.localeCompare(b.cbsa) || a.soc.localeCompare(b.soc))
  for (const { cbsa, soc, capped, ...rest } of sorted) {
    const row: SalaryRow = capped.length ? { ...rest, capped } : { ...rest }
    ;(out[cbsa] ??= {})[soc] = row
  }
  return { salaries: out, excluded }
}

export type TitlesJson = { lcaPeriod: string; families: ReturnType<typeof aggregateTitles>['families'] }

/** Verbatim spec-shape mapping: aggregateTitles' families/buckets pass straight through
 *  (buildTitles adds only lcaPeriod, which — like meta's — is run.ts provenance, not
 *  derivable from the aggregation itself). `matchedTotal` is aggregateTitles' own
 *  bookkeeping for run.ts's data-quality assertions; it is not part of the emitted contract. */
export function buildTitles(agg: ReturnType<typeof aggregateTitles>, lcaPeriod: string): TitlesJson {
  return { lcaPeriod, families: agg.families }
}

export type ConflationJson = { lcaPeriod: string } & ConflationAgg

/** Title↔SOC conflation matrix, plus run.ts's lcaPeriod provenance. Emitted to conflation.json. */
export function buildConflation(agg: ConflationAgg, lcaPeriod: string): ConflationJson {
  return { lcaPeriod, ...agg }
}

export function buildEmployerFiles(agg: Map<string, Map<string, EmployerBundle>>, keep: Set<string>):
  { files: { cbsa: string; body: { cbsa: string; roles: Record<string, EmployerBundle> } }[]; excluded: number } {
  let excluded = 0
  const files = [...agg.entries()]
    .filter(([cbsa]) => {
      if (!keep.has(cbsa)) { excluded++; return false }
      return true
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cbsa, bySoc]) => ({
      cbsa,
      body: { cbsa, roles: Object.fromEntries([...bySoc.entries()].sort(([a], [b]) => a.localeCompare(b))) },
    }))
  return { files, excluded }
}
