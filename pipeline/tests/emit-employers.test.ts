import { describe, expect, it } from 'vitest'
import { aliasCollapse, aliasCoverage, buildEmployerArtifacts } from '../lib/emit-employers'
import type { EmployerProfile } from '../lib/aggregate-employer-profiles'

const profile = (key: string, slug: string, totalFilings: number): EmployerProfile => ({
  key, slug, display: key, category: 'direct', aliased: false, totalFilings,
  entities: [{ name: key, filings: totalFilings }],
  roles: {
    '15-1252': {
      national: { filings: totalFilings, p25: 100000, median: 120000, p75: 140000 },
      metros: [{ cbsa: '12420', filings: totalFilings, median: 120000 }],
    },
  },
})

describe('buildEmployerArtifacts', () => {
  it('prerenders exactly the top N by filings and reports the equivalent floor', () => {
    const profiles = new Map([
      ['A', profile('A', 'a', 100)],
      ['B', profile('B', 'b', 50)],
      ['C', profile('C', 'c', 10)],
    ])
    const out = buildEmployerArtifacts(profiles, 'FY2025 Q1–Q4', 2)
    expect(out.profiles.map(p => p.slug)).toEqual(['a', 'b'])
    expect(out.head.employers.map(e => e.slug)).toEqual(['a', 'b'])
    expect(out.stats).toEqual({ prerendered: 2, tail: 1, equivalentFloor: 50 })
  })

  it('indexes every filer, head and tail alike, sharded by first slug character', () => {
    const profiles = new Map([
      ['A', profile('A', 'apple', 100)],
      ['B', profile('B', 'beta', 5)],
      ['C', profile('C', 'avocado', 1)],
    ])
    const out = buildEmployerArtifacts(profiles, 'FY2025 Q1–Q4', 1)
    expect(Object.keys(out.index).sort()).toEqual(['a', 'b'])
    expect(out.index['a'].v.map(row => row[0])).toEqual(['apple', 'avocado'])
  })

  it('shards digits under their own character', () => {
    const profiles = new Map([['X', profile('X', '3m', 5)]])
    const out = buildEmployerArtifacts(profiles, 'FY2025 Q1–Q4', 1)
    expect(Object.keys(out.index)).toEqual(['3'])
  })

  it('routes an empty slug to the _ shard rather than crashing', () => {
    // slugify() strips non-alphanumerics and trims separators, so a slug can only fail the
    // [a-z0-9] test by being empty — e.g. an employer filed as "...". A later task asserts
    // these never reach emit, but the shard router must not depend on that.
    const profiles = new Map([['X', profile('X', '', 5)]])
    const out = buildEmployerArtifacts(profiles, 'FY2025 Q1–Q4', 1)
    expect(Object.keys(out.index)).toEqual(['_'])
  })

  it('stamps lcaPeriod provenance on every artifact', () => {
    const out = buildEmployerArtifacts(new Map([['A', profile('A', 'a', 5)]]), 'FY2025 Q1–Q4', 1)
    expect(out.head.lcaPeriod).toBe('FY2025 Q1–Q4')
    expect(out.profiles[0].lcaPeriod).toBe('FY2025 Q1–Q4')
  })
})

describe('alias bounds', () => {
  const mixed = new Map([
    ['amazon', { ...profile('amazon', 'amazon', 90), aliased: true }],
    ['SHEETZ', profile('SHEETZ', 'sheetz', 10)],
  ])

  it('aliasCollapse is the aliased share of all filings', () => {
    expect(aliasCollapse(mixed)).toBeCloseTo(0.9)
  })

  it('aliasCoverage is the aliased share of the top-N filings', () => {
    expect(aliasCoverage(mixed, 1)).toBeCloseTo(1.0)
    expect(aliasCoverage(mixed, 2)).toBeCloseTo(0.9)
  })

  it('returns 0 for an empty profile set rather than NaN', () => {
    expect(aliasCollapse(new Map())).toBe(0)
    expect(aliasCoverage(new Map(), 5)).toBe(0)
  })
})
