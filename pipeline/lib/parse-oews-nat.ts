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
export function parseOewsNational(
  rows: Record<string, unknown>[],
  topCode: number,
): Record<string, NationalRoleRecord> {
  const cell = makeCell(topCode)
  const out: Record<string, NationalRoleRecord> = {}
  for (const raw of rows) {
    const soc = String(raw.OCC_CODE ?? '').trim()
    if (!SOC_SET.has(soc)) continue
    // O_GROUP distinguishes an individual occupation ('detailed') from SOC rollup rows
    // ('total' / 'major' / 'minor' / 'broad') that share the same OCC_CODE prefix pattern but
    // are not real per-occupation data.
    if (String(raw.O_GROUP ?? '').trim() !== 'detailed') continue

    const p10 = cell(raw.A_PCT10), p25 = cell(raw.A_PCT25), p50 = cell(raw.A_MEDIAN)
    const p75 = cell(raw.A_PCT75), p90 = cell(raw.A_PCT90)
    const capped: Pct[] = []
    if (p10.capped) capped.push('p10')
    if (p25.capped) capped.push('p25')
    if (p50.capped) capped.push('p50')
    if (p75.capped) capped.push('p75')
    if (p90.capped) capped.push('p90')

    out[soc] = {
      emp: num(raw.TOT_EMP),
      p10: p10.value, p25: p25.value, p50: p50.value, p75: p75.value, p90: p90.value,
      capped,
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error('no registry SOC rows found — wrong file or schema drift (parseOewsNational)')
  }
  return out
}
