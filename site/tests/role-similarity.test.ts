import { describe, expect, it } from 'vitest'
import type { Meta, Salaries, SalaryRow } from '../lib/types'
import { MIN_SHARED, similarByPay } from '../lib/role-similarity'

const roles = [
  { soc: 'A', label: 'Anchor', short: 'A' },
  { soc: 'T', label: 'Twin', short: 'T' },     // identical pay to A
  { soc: 'H', label: 'Higher', short: 'H' },   // 10% more than A everywhere
  { soc: 'F', label: 'Far', short: 'F' },       // half of A
]
// Enough metros to clear MIN_SHARED for A/T/H; 'thin' role covered in its own test.
const cbsas = Array.from({ length: MIN_SHARED + 5 }, (_, i) => String(10000 + i))

const meta = {
  year: 2025, generated: '', topCodeValue: 239200, rppYear: 2024, lcaPeriod: '',
  sources: { oews: '', lca: [], hud: '', zipMatchRate: 0.99 }, roles,
  metros: cbsas.map(cbsa => ({ cbsa, name: `M ${cbsa}`, state: 'XX', lat: 0, lng: 0, rpp: 100, lcaFilings: 0 })),
} as unknown as Meta

const p = (p50: number): SalaryRow => ({ emp: 1, lq: 1, p10: null, p25: null, p50, p75: null, p90: null })
const salaries: Salaries = {}
for (const cbsa of cbsas) {
  const base = 100_000 + Number(cbsa) // vary by metro so vectors aren't constant
  salaries[cbsa] = { A: p(base), T: p(base), H: p(base * 1.1), F: p(base * 0.5) }
}

describe('similarByPay', () => {
  it('ranks the identical twin first with overlap 1, and excludes the anchor', () => {
    const sim = similarByPay(meta, salaries, 'A')
    expect(sim.map(s => s.soc)).not.toContain('A')
    expect(sim[0].soc).toBe('T')
    expect(sim[0].overlap).toBeCloseTo(1, 10)
  })
  it('computes overlap as min/max for a uniformly higher role', () => {
    const h = similarByPay(meta, salaries, 'A').find(s => s.soc === 'H')!
    expect(h.overlap).toBeCloseTo(1 / 1.1, 6) // 0.9090…
    expect(h.ratio).toBeCloseTo(1 / 1.1, 6)   // anchor/other = base / 1.1base
    expect(h.shared).toBe(cbsas.length)
    expect(h.thin).toBe(false)
  })
  it('orders by overlap desc (twin > higher > far)', () => {
    expect(similarByPay(meta, salaries, 'A').map(s => s.soc)).toEqual(['T', 'H', 'F'])
  })
  it('flags a thin pair (few shared metros) and demotes it at equal overlap', () => {
    // Twin present in only 3 metros -> thin; a second exact twin present everywhere -> not thin.
    const roles2 = [...roles, { soc: 'T2', label: 'Twin2', short: 'T2' }]
    const meta2 = { ...meta, roles: roles2 } as Meta
    const sal2: Salaries = {}
    cbsas.forEach((cbsa, i) => {
      sal2[cbsa] = { ...salaries[cbsa], T2: p(100_000 + Number(cbsa)) } // T2 == A everywhere
      if (i >= 3) delete (sal2[cbsa] as Record<string, unknown>).T // T only in first 3 metros
    })
    const sim = similarByPay(meta2, sal2, 'A')
    const t = sim.find(s => s.soc === 'T')!, t2 = sim.find(s => s.soc === 'T2')!
    expect(t.thin).toBe(true)
    expect(t2.thin).toBe(false)
    expect(sim.findIndex(s => s.soc === 'T2')).toBeLessThan(sim.findIndex(s => s.soc === 'T')) // well-supported first
  })
  it('is COL-invariant: dividing a role vector by a per-metro factor leaves the ranking unchanged', () => {
    const adj: Salaries = {}
    for (const cbsa of cbsas) {
      const f = 1 + (Number(cbsa) % 7) / 10 // arbitrary per-metro RPP-like factor
      const r = salaries[cbsa]
      adj[cbsa] = { A: p(r.A.p50! / f), T: p(r.T.p50! / f), H: p(r.H.p50! / f), F: p(r.F.p50! / f) }
    }
    expect(similarByPay(meta, adj, 'A').map(s => s.soc))
      .toEqual(similarByPay(meta, salaries, 'A').map(s => s.soc))
  })
})
