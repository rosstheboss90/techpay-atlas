import { makeCell, num } from './num'
import { SOC_SET } from './soc'
import type { Pct } from './parse-oews'
import type { NationalRoleRecord } from './history'

/** National OEWS parser. Deliberately separate from parseOews (parse-oews.ts): that parser keys
 *  records by CBSA and zero-pads AREA to five digits, which would turn the national file's
 *  AREA=99 into a bogus CBSA "00099" — not a throw, a silently fake geography. This file's output
 *  is keyed by SOC instead, because the national file has exactly one row per occupation (no
 *  industry or ownership breakout to disambiguate on) rather than one row per metro x occupation.
 *
 *  Throws if zero registry SOCs are found, on the same "wrong file or schema drift fails loudly"
 *  principle as parseOews's zod schema — an empty result here would otherwise silently produce a
 *  0-role archive vintage (which buildNationalArchive also refuses, but this catches it earlier
 *  and with a more specific message). */

const FIELDS = ['OCC_CODE', 'O_GROUP', 'TOT_EMP', 'A_PCT10', 'A_PCT25', 'A_MEDIAN', 'A_PCT75', 'A_PCT90'] as const
type FieldName = typeof FIELDS[number]

/** Case-insensitive column resolution, built ONCE per parse call rather than per row — these
 *  files run ~1,400 rows across seven vintages, and a per-row Object.keys().find() would be
 *  needless repeated work for a mapping that is identical across every row in one file (same
 *  sheet, same header row).
 *
 *  MEASURED drift (2026-08-06, against every May vintage 2019-2025 on disk):
 *   - 2019: ALL headers lowercase (occ_code, o_group, tot_emp, a_pct10, a_median, ...) and there
 *     is NO PRIM_STATE column at all.
 *   - 2020: uppercase headers, PRIM_STATE added.
 *   - 2021 onward: uppercase headers, PRIM_STATE + PCT_RPT both present.
 *  Same precedent as crosswalk.ts's `field()` helper for HUD's ZIP/CBSA extracts — column casing
 *  drifting across BLS/HUD vintages is a recurring shape, not a one-off. Do not "simplify" this
 *  back into direct `raw.OCC_CODE`-style access; that is exactly what crashed on 2019. */
function buildFieldMap(sampleRow: Record<string, unknown>): Map<FieldName, string | undefined> {
  const upperToActual = new Map<string, string>()
  for (const k of Object.keys(sampleRow)) upperToActual.set(k.toUpperCase(), k)
  const map = new Map<FieldName, string | undefined>()
  for (const name of FIELDS) map.set(name, upperToActual.get(name))
  return map
}

function readField(row: Record<string, unknown>, key: string | undefined): unknown {
  return key === undefined ? undefined : row[key]
}

export function parseOewsNational(
  rows: Record<string, unknown>[],
  topCode: number,
): Record<string, NationalRoleRecord> {
  const cell = makeCell(topCode)
  const out: Record<string, NationalRoleRecord> = {}
  const fields = rows.length > 0 ? buildFieldMap(rows[0]) : null
  const occCodeKey = fields?.get('OCC_CODE')
  const oGroupKey = fields?.get('O_GROUP')
  const totEmpKey = fields?.get('TOT_EMP')
  const p10Key = fields?.get('A_PCT10')
  const p25Key = fields?.get('A_PCT25')
  const p50Key = fields?.get('A_MEDIAN')
  const p75Key = fields?.get('A_PCT75')
  const p90Key = fields?.get('A_PCT90')

  for (const raw of rows) {
    const soc = String(readField(raw, occCodeKey) ?? '').trim()
    if (!SOC_SET.has(soc)) continue
    // O_GROUP distinguishes an individual occupation ('detailed') from SOC rollup rows
    // ('total' / 'major' / 'minor' / 'broad') that share the same OCC_CODE prefix pattern but
    // are not real per-occupation data. When the column is missing entirely from the file, don't
    // silently drop every row — fall back to SOC_SET alone. All 21 registry codes are detailed
    // six-digit codes ending in a non-zero digit, so they cannot collide with a major/minor/broad
    // rollup code, which always ends in 0. (2019 does still carry o_group, so this branch is
    // defensive rather than the fix for the measured 2019 drift — kept in case a future vintage
    // drops the column outright.)
    if (oGroupKey !== undefined) {
      if (String(readField(raw, oGroupKey) ?? '').trim() !== 'detailed') continue
    }

    const p10 = cell(readField(raw, p10Key)), p25 = cell(readField(raw, p25Key)), p50 = cell(readField(raw, p50Key))
    const p75 = cell(readField(raw, p75Key)), p90 = cell(readField(raw, p90Key))
    const capped: Pct[] = []
    if (p10.capped) capped.push('p10')
    if (p25.capped) capped.push('p25')
    if (p50.capped) capped.push('p50')
    if (p75.capped) capped.push('p75')
    if (p90.capped) capped.push('p90')

    out[soc] = {
      emp: num(readField(raw, totEmpKey)),
      p10: p10.value, p25: p25.value, p50: p50.value, p75: p75.value, p90: p90.value,
      capped,
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error('no registry SOC rows found — wrong file or schema drift (parseOewsNational)')
  }
  return out
}
