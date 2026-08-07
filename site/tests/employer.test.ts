import { describe, expect, it } from 'vitest'
import { decodeShard, rankRoles, isThinSample, filterStaffing, THIN_EMPLOYER_FILINGS } from '../lib/employer'
import type { EmployerIndexShard, EmployerProfileJson } from '../lib/employer-types'

const shard: EmployerIndexShard = {
  k: ['slug', 'display', 'filings', 'category', 'aliased', 'topRole', 'topCbsa', 'median'],
  v: [['acme', 'Acme', 12, 'direct', false, '15-1252', '12420', 120000]],
}

describe('decodeShard', () => {
  it('maps positional arrays onto named rows using the k header', () => {
    expect(decodeShard(shard)).toEqual([{
      slug: 'acme', display: 'Acme', filings: 12, category: 'direct',
      aliased: false, topRole: '15-1252', topCbsa: '12420', median: 120000,
    }])
  })
})

const profile = (roles: EmployerProfileJson['roles']): EmployerProfileJson => ({
  slug: 'x', display: 'X', category: 'direct', aliased: false,
  lcaPeriod: 'FY2025 Q1–Q4', totalFilings: 0, entities: [], roles,
})

describe('rankRoles', () => {
  it('orders roles by national filings, descending', () => {
    const p = profile({
      '15-1211': { national: { filings: 5, p25: 1, median: 2, p75: 3 }, metros: [] },
      '15-1252': { national: { filings: 50, p25: 1, median: 2, p75: 3 }, metros: [] },
    })
    expect(rankRoles(p)).toEqual(['15-1252', '15-1211'])
  })
})

describe('isThinSample', () => {
  it('marks cells under the threshold', () => {
    expect(isThinSample(THIN_EMPLOYER_FILINGS - 1)).toBe(true)
    expect(isThinSample(THIN_EMPLOYER_FILINGS)).toBe(false)
  })
})

describe('filterStaffing', () => {
  const rows = [
    { slug: 'a', display: 'A', filings: 9, category: 'staffing' as const, aliased: true, topRole: '15-1252', topCbsa: '1', median: 1 },
    { slug: 'b', display: 'B', filings: 8, category: 'direct' as const, aliased: false, topRole: '15-1252', topCbsa: '1', median: 1 },
    { slug: 'c', display: 'C', filings: 7, category: 'staffing' as const, aliased: false, topRole: '15-1252', topCbsa: '1', median: 1 },
  ]
  it('keeps everything when the toggle is off', () => {
    expect(filterStaffing(rows, false).map(r => r.slug)).toEqual(['a', 'b', 'c'])
  })
  it('removes only KNOWN staffing firms when on — never unreviewed defaults', () => {
    // 'c' is category staffing but aliased:false, which cannot happen from the current pipeline
    // (category only becomes staffing via the curated alias file). Pinned anyway: the rule is
    // "explicitly reviewed", so an unaliased row must survive regardless of its category.
    expect(filterStaffing(rows, true).map(r => r.slug)).toEqual(['b', 'c'])
  })
})
