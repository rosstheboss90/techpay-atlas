// pipeline/lib/parse-lca.ts
import { num } from './num'
import { targetSoc } from './soc'

export interface LcaRecord { soc: string; employer: string; zip: string; annualWage: number }

const UNIT_FACTOR: Record<string, number> = { Year: 1, Hour: 2080, Week: 52, 'Bi-Weekly': 26, Month: 12 }
const WAGE_MIN = 20_000, WAGE_MAX = 2_000_000

/** Certified, full-time, target-SOC LCA rows -> normalized records. Everything else is dropped;
 *  drop accounting is the orchestrator's job (input minus output). */
export function lcaRowsToRecords(rows: Record<string, unknown>[]): LcaRecord[] {
  const out: LcaRecord[] = []
  for (const r of rows) {
    if (String(r.CASE_STATUS ?? '').trim() !== 'Certified') continue
    if (String(r.FULL_TIME_POSITION ?? '').trim() !== 'Y') continue
    const soc = targetSoc(r.SOC_CODE)
    if (!soc) continue
    const factor = UNIT_FACTOR[String(r.WAGE_UNIT_OF_PAY ?? '').trim()]
    if (!factor) continue
    const base = num(r.WAGE_RATE_OF_PAY_FROM)
    if (base === null) continue
    const annualWage = Math.round(base * factor)
    if (annualWage < WAGE_MIN || annualWage > WAGE_MAX) continue
    const zip = String(r.WORKSITE_POSTAL_CODE ?? '').trim().split('-')[0].padStart(5, '0')
    if (!/^\d{5}$/.test(zip)) continue
    const employer = String(r.EMPLOYER_NAME ?? '').replace(/\s+/g, ' ').trim()
    if (!employer) continue
    out.push({ soc, employer, zip, annualWage })
  }
  return out
}
