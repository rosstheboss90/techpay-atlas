import { describe, expect, it } from 'vitest'
import { adjust, displayPct, metricValue, rankMetros } from '../lib/derive'
import type { MetroMeta, SalaryRow } from '../lib/types'

const metro = (over: Partial<MetroMeta> = {}): MetroMeta =>
  ({ cbsa: '12420', name: 'Austin', state: 'TX', lat: 30, lng: -97, rpp: 98, lcaFilings: 100, ...over })
const row = (over: Partial<SalaryRow> = {}): SalaryRow =>
  ({ emp: 1000, lq: 1.5, p10: 80000, p25: 100000, p50: 134000, p75: 160000, p90: 200000, ...over })

describe('adjust', () => {
  it('divides by rpp/100 when adjusting', () => {
    expect(adjust(134000, 98, true)).toBeCloseTo(136734.69, 1)
    expect(adjust(134000, 98, false)).toBe(134000)
  })
  it('returns null for null value or (when adjusting) null rpp', () => {
    expect(adjust(null, 98, true)).toBeNull()
    expect(adjust(134000, null, true)).toBeNull()
    expect(adjust(134000, null, false)).toBe(134000)
  })
})

describe('metricValue', () => {
  it('selects pay (adjusted-aware), employment, and concentration', () => {
    expect(metricValue(row(), metro(), 'pay', false)).toBe(134000)
    expect(metricValue(row(), metro(), 'pay', true)).toBeCloseTo(136734.69, 1)
    expect(metricValue(row(), metro(), 'emp', true)).toBe(1000)   // adj never affects emp
    expect(metricValue(row(), metro(), 'lq', false)).toBe(1.5)
    expect(metricValue(undefined, metro(), 'pay', false)).toBeNull()
  })
})

describe('rankMetros', () => {
  it('ranks metros by metric desc, skipping nulls, 1-based', () => {
    const metros = [metro(), metro({ cbsa: '19100', rpp: 103 }), metro({ cbsa: '41860', rpp: 119 })]
    const salaries = {
      '12420': { '15-1252': row() },
      '19100': { '15-1252': row({ p50: 128000 }) },
      '41860': { '15-1252': row({ p50: 165000 }) },
    }
    const ranks = rankMetros(metros, salaries, '15-1252', 'pay', false)
    expect(ranks.get('41860')).toBe(1)
    expect(ranks.get('12420')).toBe(2)
    expect(ranks.get('19100')).toBe(3)
  })
  it('in adjusted mode a high-rpp metro can lose rank', () => {
    const metros = [metro(), metro({ cbsa: '41860', rpp: 119 })]
    const salaries = {
      '12420': { '15-1252': row({ p50: 134000 }) },   // adj ≈ 136.7k
      '41860': { '15-1252': row({ p50: 150000 }) },   // adj ≈ 126.1k
    }
    const ranks = rankMetros(metros, salaries, '15-1252', 'pay', true)
    expect(ranks.get('12420')).toBe(1)
  })
})

describe('displayPct', () => {
  it('prefixes ≥ for capped percentiles', () => {
    expect(displayPct(row({ capped: ['p90'] }), 'p90', 98, false)).toBe('≥ $200,000')
    expect(displayPct(row(), 'p50', 98, false)).toBe('$134,000')
    expect(displayPct(row({ p50: null }), 'p50', 98, false)).toBe('—')
  })
})
