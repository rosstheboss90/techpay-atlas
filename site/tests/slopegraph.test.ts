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

describe('rank basis is the shown subset, not the nation', () => {
  // The SlopeExplorer's caption claims "ranks are among the N shown". That claim is only true
  // because slopeRows re-ranks whatever subset it returns — if the explorer sliced a pre-ranked
  // full list instead, the caption would be a lie. This pins the property the caption rests on.
  it('the same metro carries a different delta at different row counts', () => {
    // A local fixture, because the shared one cannot show this: every metro it adds beyond the
    // top 3 adjusts WORSE than Aville, so Aville's adjusted rank never moves. Here each
    // successively cheaper metro adjusts BETTER, which is what pushes the top nominal payer down
    // as the set widens — the real-world pattern (expensive coastal hub vs cheap inland metro).
    const X = metro('XXXXX', 'Xhub, CA', 150)     // 300k / 1.50 = 200k adjusted
    const Y = metro('YYYYY', 'Yburg, WA', 100)    // 250k / 1.00 = 250k
    const Z = metro('ZZZZZ', 'Zville, OH', 79)    // 200k / 0.79 ≈ 253k
    const W = metro('WWWWW', 'Wton, MS', 50)      // 150k / 0.50 = 300k
    const local: Salaries = {
      XXXXX: { S1: row(300_000) }, YYYYY: { S1: row(250_000) },
      ZZZZZ: { S1: row(200_000) }, WWWWW: { S1: row(150_000) },
    }
    const set = [X, Y, Z, W]

    const top2 = slopeRows(set, local, 'S1', 2)
    const all = slopeRows(set, local, 'S1', Number.MAX_SAFE_INTEGER)
    const xTop2 = top2.find(r => r.cbsa === 'XXXXX')!
    const xAll = all.find(r => r.cbsa === 'XXXXX')!

    expect(top2).toHaveLength(2)
    expect(all).toHaveLength(4)
    // Top nominal payer in both sets...
    expect(xTop2.nominalRank).toBe(1)
    expect(xAll.nominalRank).toBe(1)
    // ...but it falls one place among 2 and three places among 4. Slicing a pre-ranked list
    // would report the same delta for both, which is exactly what the caption must not do.
    expect(xTop2.delta).toBe(-1)
    expect(xAll.delta).toBe(-3)
  })

  it('every rank in a subset falls within 1..length — never a national rank leaking through', () => {
    for (const n of [2, 3, 4]) {
      const rows = slopeRows(metros, salaries, 'S1', n)
      for (const r of rows) {
        expect(r.nominalRank).toBeGreaterThanOrEqual(1)
        expect(r.nominalRank).toBeLessThanOrEqual(rows.length)
        expect(r.adjustedRank).toBeGreaterThanOrEqual(1)
        expect(r.adjustedRank).toBeLessThanOrEqual(rows.length)
      }
    }
  })

  it('an n larger than the rankable set returns every rankable metro and no more', () => {
    const all = slopeRows(metros, salaries, 'S1', Number.MAX_SAFE_INTEGER)
    // Dport has no rpp, so it has no adjusted position and must not appear at any n.
    expect(all.map(r => r.cbsa)).not.toContain('DDDDD')
    expect(all).toHaveLength(4)
  })
})
