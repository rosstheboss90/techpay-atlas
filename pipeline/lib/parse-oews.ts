import { z } from 'zod'
import { cell as currentCell, num } from './num'
import { SOC_SET } from './soc'

export type Pct = 'p10' | 'p25' | 'p50' | 'p75' | 'p90'

export interface SalaryRecord {
  cbsa: string; soc: string; emp: number | null; lq: number | null
  p10: number | null; p25: number | null; p50: number | null; p75: number | null; p90: number | null
  capped: Pct[]
}

const cellSchema = z.union([z.string(), z.number(), z.null()]).optional()
const rowSchema = z.object({
  AREA: z.union([z.string(), z.number()]),
  AREA_TITLE: z.string(),
  PRIM_STATE: z.string().optional(),
  OCC_CODE: z.string(),
  TOT_EMP: cellSchema, LOC_QUOTIENT: cellSchema,
  A_PCT10: cellSchema, A_PCT25: cellSchema, A_MEDIAN: cellSchema, A_PCT75: cellSchema, A_PCT90: cellSchema,
})

const FIELDS = ['AREA', 'AREA_TITLE', 'PRIM_STATE', 'OCC_CODE', 'TOT_EMP', 'LOC_QUOTIENT',
  'A_PCT10', 'A_PCT25', 'A_MEDIAN', 'A_PCT75', 'A_PCT90'] as const
type FieldName = typeof FIELDS[number]

/** Case-insensitive column resolution, built ONCE per parseOews call rather than per row — this
 *  file processes ~150k rows per MSA vintage, and a per-row Object.keys().find() would be needless
 *  repeated work for a mapping that is identical across every row in one file (same sheet, same
 *  header row).
 *
 *  MEASURED drift (2026-08-06, data/raw/oesm19ma/MSA_M2019_dl.xlsx vs 2020+):
 *   - 2019: ALL headers lowercase (area, area_title, occ_code, tot_emp, a_pct10, ...) and there is
 *     NO prim_state column at all.
 *   - 2020 onward: uppercase headers, PRIM_STATE present.
 *  Same precedent as crosswalk.ts's `field()` helper for HUD's ZIP/CBSA extracts, and
 *  parse-oews-nat.ts's buildFieldMap for the national OEWS file — column casing drifting across
 *  BLS/HUD vintages is a recurring trait, not a one-off. Do not "simplify" this resolver away by
 *  going back to direct `raw.OCC_CODE`-style access; that is exactly what crashed on 2019. */
function buildFieldMap(sampleRow: Record<string, unknown>): Map<FieldName, string | undefined> {
  const upperToActual = new Map<string, string>()
  for (const k of Object.keys(sampleRow)) upperToActual.set(k.toUpperCase(), k)
  const map = new Map<FieldName, string | undefined>()
  for (const name of FIELDS) map.set(name, upperToActual.get(name))
  return map
}

/** Remaps one row onto canonical uppercase field names so rowSchema.parse always sees the keys
 *  it expects, regardless of the source file's header casing. A field genuinely absent from the
 *  file (e.g. 2019's missing prim_state) is simply omitted, not set to undefined — that keeps it
 *  "missing" rather than "present but undefined" for zod's .optional() check. */
function normalizeRow(raw: Record<string, unknown>, fields: Map<FieldName, string | undefined>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const name of FIELDS) {
    const key = fields.get(name)
    if (key !== undefined) out[name] = raw[key]
  }
  return out
}

const isTarget = (raw: Record<string, unknown>) => SOC_SET.has(String(raw.OCC_CODE ?? '').trim())
const toCbsa = (area: string | number) => String(area).trim().padStart(5, '0')

/** Single pass over target-SOC rows -> records plus the CBSA -> {name,state} area map.
 *  Throws (zod) if a matching row is missing required columns. Non-target rows (incl. O_GROUP
 *  rollups like 00-0000) fall out via the SOC filter itself, so the schema stays tolerant of
 *  vintage differences in optional columns. */
export function parseOews(
  rows: Record<string, unknown>[],
  cell: (v: unknown) => { value: number | null; capped: boolean } = currentCell,
):
  { records: SalaryRecord[]; areas: Map<string, { name: string; state: string }> } {
  const records: SalaryRecord[] = []
  const areas = new Map<string, { name: string; state: string }>()
  const fields = rows.length > 0 ? buildFieldMap(rows[0]) : null
  for (const raw of rows) {
    const normalized = fields ? normalizeRow(raw, fields) : raw
    if (!isTarget(normalized)) continue
    const r = rowSchema.parse(normalized)
    const cbsa = toCbsa(r.AREA)
    const p10 = cell(r.A_PCT10), p25 = cell(r.A_PCT25), p50 = cell(r.A_MEDIAN), p75 = cell(r.A_PCT75), p90 = cell(r.A_PCT90)
    const capped: Pct[] = []
    if (p10.capped) capped.push('p10')
    if (p25.capped) capped.push('p25')
    if (p50.capped) capped.push('p50')
    if (p75.capped) capped.push('p75')
    if (p90.capped) capped.push('p90')
    records.push({
      cbsa, soc: r.OCC_CODE.trim(),
      emp: num(r.TOT_EMP), lq: num(r.LOC_QUOTIENT),
      p10: p10.value, p25: p25.value, p50: p50.value, p75: p75.value, p90: p90.value,
      capped,
    })
    areas.set(cbsa, { name: r.AREA_TITLE, state: r.PRIM_STATE ?? '' })
  }
  return { records, areas }
}

/** @deprecated thin wrapper over parseOews — kept so existing callers/tests keep working. */
export function oewsRowsToRecords(rows: Record<string, unknown>[]): SalaryRecord[] {
  return parseOews(rows).records
}

/** @deprecated thin wrapper over parseOews — kept so existing callers/tests keep working. */
export function extractAreas(rows: Record<string, unknown>[]): Map<string, { name: string; state: string }> {
  return parseOews(rows).areas
}
