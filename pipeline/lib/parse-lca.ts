import { num } from './num'
import { targetSoc } from './soc'

export interface LcaRecord { soc: string; employer: string; zip: string; annualWage: number; caseNumber: string }

export type DropReason = 'status' | 'partTime' | 'soc' | 'unit' | 'wage' | 'range' | 'zip' | 'employer'

const norm = (v: unknown) => String(v ?? '').trim().toUpperCase()

const UNIT_FACTOR: Record<string, number> = { YEAR: 1, HOUR: 2080, WEEK: 52, BIWEEKLY: 26, MONTH: 12 }
const WAGE_MIN = 20_000, WAGE_MAX = 2_000_000

/** Certified, full-time, target-SOC LCA rows -> normalized records, plus a per-reason drop count
 *  for every row that didn't make it (so schema drift shows up as numbers, not silence). */
export function lcaRowsToRecords(rows: Record<string, unknown>[]): { records: LcaRecord[]; drops: Record<DropReason, number> } {
  const out: LcaRecord[] = []
  const drops: Record<DropReason, number> = { status: 0, partTime: 0, soc: 0, unit: 0, wage: 0, range: 0, zip: 0, employer: 0 }
  for (const r of rows) {
    if (norm(r.CASE_STATUS) !== 'CERTIFIED') { drops.status++; continue }
    if (!/^Y/.test(norm(r.FULL_TIME_POSITION))) { drops.partTime++; continue }
    const soc = targetSoc(r.SOC_CODE)
    if (!soc) { drops.soc++; continue }
    const factor = UNIT_FACTOR[norm(r.WAGE_UNIT_OF_PAY).replace(/[^A-Z]/g, '')]
    if (!factor) { drops.unit++; continue }
    const base = num(r.WAGE_RATE_OF_PAY_FROM)
    if (base === null) { drops.wage++; continue }
    const to = num(r.WAGE_RATE_OF_PAY_TO)
    const rate = to !== null && to > base ? (base + to) / 2 : base
    const annualWage = Math.round(rate * factor)
    if (annualWage < WAGE_MIN || annualWage > WAGE_MAX) { drops.range++; continue }
    const d = String(r.WORKSITE_POSTAL_CODE ?? '').replace(/\D/g, '')
    const zip = d.length > 5 ? d.padStart(9, '0').slice(0, 5) : d.padStart(5, '0')
    if (!/^\d{5}$/.test(zip)) { drops.zip++; continue }
    const employer = String(r.EMPLOYER_NAME ?? '').replace(/\s+/g, ' ').trim()
    if (!employer) { drops.employer++; continue }
    const caseNumber = String(r.CASE_NUMBER ?? '').trim()
    out.push({ soc, employer, zip, annualWage, caseNumber })
  }
  return { records: out, drops }
}
