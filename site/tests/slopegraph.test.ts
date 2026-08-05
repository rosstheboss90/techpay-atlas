import { describe, expect, it } from 'vitest'
import type { MetroMeta, Salaries, SalaryRow } from '../lib/types'
import { slopeRows } from '../lib/slopegraph'

const metro = (cbsa: string, name: string, rpp: number | null): MetroMeta =>
  ({ cbsa, name, state: name.slice(-2), lat: 0, lng: 0, rpp, lcaFilings: 0 })

const row = (p50: number | null, capped = false): SalaryRow =>
  ({ emp: 100, lq: 1, p10: null, p25: null, p50, p75: null, p90: null, ...(capped ? { capped: ['p50'] } : {}) })

// A expensive hub (high nominal, high rpp); C cheaper city that leapfrogs on adjustment; D no rpp.
const A = metro('AAAAA', 'Aville, CA', 150)
const B = metro('BBBBB', 'Btown, TX', 100)
const C = metro('CCCCC', 'Ccity, OH', 90)
const D = metro('DDDDD', 'Dport, PR', null)
const E = metro('EEEEE', 'Etown, NV', 100)
const metros = [A, B, C, D, E]

const salaries: Salaries = {
  AAAAA: { S1: row(200_000) },              // adj 133,333
  BBBBB: { S1: row(180_000) },              // adj 180,000
  CCCCC: { S1: row(170_000) },              // adj 188,889
  DDDDD: { S1: row(160_000) },              // rpp null -> excluded
  EEEEE: { S1: row(100_000, true) },        // adj 100,000, top-coded
}

describe('slopeRows', () => {
  it('ranks the shown subset by nominal (left) and adjusted (right), with delta', () => {
    const rows = slopeRows(metros, salaries, 'S1', 4)
    expect(rows.map(r => r.cbsa)).toEqual(['AAAAA', 'BBBBB', 'CCCCC', 'EEEEE']) // nominal order; D excluded
    const A_ = rows.find(r => r.cbsa === 'AAAAA')!
    const C_ = rows.find(r => r.cbsa === 'CCCCC')!
    expect([A_.nominalRank, A_.adjustedRank, A_.delta]).toEqual([1, 3, -2]) // pricey hub falls
    expect([C_.nominalRank, C_.adjustedRank, C_.delta]).toEqual([3, 1, 2])  // cheaper city rises
  })

  it('excludes rpp-null and suppressed metros', () => {
    const withSuppressed: Salaries = { ...salaries, BBBBB: { S1: row(null) } }
    const cbsas = slopeRows(metros, withSuppressed, 'S1', 10).map(r => r.cbsa)
    expect(cbsas).not.toContain('DDDDD') // rpp null
    expect(cbsas).not.toContain('BBBBB') // p50 suppressed
  })

  it('re-ranks within the shown set when N shrinks (basis is the subset, not the nation)', () => {
    const rows = slopeRows(metros, salaries, 'S1', 2) // top 2 nominal: A(200k), B(180k)
    expect(rows.map(r => r.cbsa)).toEqual(['AAAAA', 'BBBBB'])
    // within {A,B}: adjusted B 180k > A 133k -> B rank 1, A rank 2
    expect(rows.find(r => r.cbsa === 'BBBBB')!.adjustedRank).toBe(1)
    expect(rows.find(r => r.cbsa === 'AAAAA')!.adjustedRank).toBe(2)
  })

  it('flags a top-coded p50', () => {
    expect(slopeRows(metros, salaries, 'S1', 10).find(r => r.cbsa === 'EEEEE')!.capped).toBe(true)
  })
})
