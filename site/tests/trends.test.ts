import { describe, expect, it } from 'vitest'
import { pathPoints, rankByChange, realDomain } from '../lib/trends'
import type { TrendsJson } from '../lib/trends-types'

const fixture: TrendsJson = {
  years: [2019, 2020, 2021, 2022],
  headlineFrom: 2021,
  headlineTo: 2022,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2022 },
  roles: {
    '15-1252': { label: 'Software Developers', short: 'SWE', firstYear: 2021,
      nominal: [null, null, 100, 110], real: [null, null, 120, 110], emp: [null, null, 5, 6],
      cappedP90: [false, false, false, false], changeReal: -0.0833 },
    '11-3021': { label: 'IT Managers', short: 'IT Mgr', firstYear: 2019,
      nominal: [80, 85, 90, 100], real: [95, 98, 105, 100], emp: [1, 2, 3, 4],
      cappedP90: [true, true, false, false], changeReal: 0.25 },
  },
  skippedRoles: [],
  breaks: [{ year: 2021, note: 'split' }],
}

describe('rankByChange', () => {
  it('orders roles by real change, largest gain first', () => {
    expect(rankByChange(fixture).map(r => r.soc)).toEqual(['11-3021', '15-1252'])
  })
  it('carries the label and change through for rendering', () => {
    const top = rankByChange(fixture)[0]
    expect(top.short).toBe('IT Mgr')
    expect(top.changeReal).toBeCloseTo(0.25, 4)
  })
  it('includes every role — the headline window makes them all comparable', () => {
    expect(rankByChange(fixture)).toHaveLength(2)
  })
})

describe('pathPoints', () => {
  it('drops leading nulls so a ragged series starts where its data does', () => {
    expect(pathPoints(fixture, '15-1252')).toEqual([
      { year: 2021, value: 120 }, { year: 2022, value: 110 },
    ])
  })
  it('returns the full series for a role present throughout', () => {
    expect(pathPoints(fixture, '11-3021')).toHaveLength(4)
  })
  it('returns an empty array for an unknown role rather than throwing', () => {
    expect(pathPoints(fixture, '99-9999')).toEqual([])
  })
})

describe('realDomain', () => {
  it('spans the min and max real value across every role', () => {
    expect(realDomain(fixture)).toEqual([95, 120])
  })
  it('ignores nulls', () => {
    const only: TrendsJson = { ...fixture, roles: { '15-1252': fixture.roles['15-1252'] } }
    expect(realDomain(only)).toEqual([110, 120])
  })
})
