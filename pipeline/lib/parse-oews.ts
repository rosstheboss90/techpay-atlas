import { z } from 'zod'
import { cell, num } from './num'
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
  PRIM_STATE: z.string(),
  OCC_CODE: z.string(),
  TOT_EMP: cellSchema, LOC_QUOTIENT: cellSchema,
  A_PCT10: cellSchema, A_PCT25: cellSchema, A_MEDIAN: cellSchema, A_PCT75: cellSchema, A_PCT90: cellSchema,
})

const isTarget = (raw: Record<string, unknown>) => SOC_SET.has(String(raw.OCC_CODE ?? '').trim())
const toCbsa = (area: string | number) => String(area).trim().padStart(5, '0')

/** Rows for target SOCs only. Throws (zod) if a matching row is missing required columns.
 *  Non-target rows (incl. O_GROUP rollups like 00-0000) fall out via the SOC filter itself,
 *  so the schema stays tolerant of vintage differences in optional columns. */
export function oewsRowsToRecords(rows: Record<string, unknown>[]): SalaryRecord[] {
  return rows.filter(isTarget).map(raw => {
    const r = rowSchema.parse(raw)
    const p10 = cell(r.A_PCT10), p25 = cell(r.A_PCT25), p50 = cell(r.A_MEDIAN), p75 = cell(r.A_PCT75), p90 = cell(r.A_PCT90)
    const capped: Pct[] = []
    if (p10.capped) capped.push('p10')
    if (p25.capped) capped.push('p25')
    if (p50.capped) capped.push('p50')
    if (p75.capped) capped.push('p75')
    if (p90.capped) capped.push('p90')
    return {
      cbsa: toCbsa(r.AREA), soc: r.OCC_CODE.trim(),
      emp: num(r.TOT_EMP), lq: num(r.LOC_QUOTIENT),
      p10: p10.value, p25: p25.value, p50: p50.value, p75: p75.value, p90: p90.value,
      capped,
    }
  })
}

/** CBSA -> { name, state } from the same rows (only target rows are consulted). */
export function extractAreas(rows: Record<string, unknown>[]): Map<string, { name: string; state: string }> {
  const out = new Map<string, { name: string; state: string }>()
  for (const raw of rows.filter(isTarget)) {
    const r = rowSchema.parse(raw)
    out.set(toCbsa(r.AREA), { name: r.AREA_TITLE, state: r.PRIM_STATE })
  }
  return out
}
