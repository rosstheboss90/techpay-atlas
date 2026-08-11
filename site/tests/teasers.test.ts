import { describe, expect, it } from 'vitest'
import type { Meta, MetroMeta, Salaries } from '../lib/types'
import type { TitlesJson } from '../lib/title-types'
import type { TrendsJson } from '../lib/trends-types'
import { colTeaser, payTeaser, shortMetro, similarTeaser, titleTeaser, trendTeaser } from '../lib/teasers'

const metro = (cbsa: string, name: string, rpp: number | null): MetroMeta =>
  ({ cbsa, name, state: 'XX', lat: 0, lng: 0, rpp, lcaFilings: 0 })

const row = (p50: number) => ({ emp: 100, lq: 1, p10: p50 * 0.6, p25: p50 * 0.8, p50, p75: p50 * 1.2, p90: p50 * 1.5 })

const trends: TrendsJson = {
  years: [2021, 2025], headlineFrom: 2021, headlineTo: 2025,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2025 },
  roles: { '15-1252': { label: 'Software Developers', short: 'SWE', firstYear: 2021,
    nominal: [120730, 135980], real: [144100, 135980], emp: [null, null],
    cappedP90: [false, false], changeReal: -0.056823 } },
  skippedRoles: [], breaks: [],
}

const titles: TitlesJson = {
  lcaPeriod: 'FY2025',
  families: [{ key: 'swe', label: 'Software Engineering', buckets: [
    { key: 'swe', label: 'Software Engineer', national: { filings: 90000, p25: 1, median: 2, p75: 3 },
      metros: {}, tiers: {}, socMix: [{ soc: '15-1252', share: 0.9 }], topEmployers: [] },
    { key: 'fullstack', label: 'Full-Stack Developer', national: { filings: 5000, p25: 1, median: 2, p75: 3 },
      metros: {}, tiers: {}, socMix: [{ soc: '15-1252', share: 0.8 }], topEmployers: [] },
  ] }],
}

describe('shortMetro', () => {
  it('takes the first city of a CBSA title', () => {
    expect(shortMetro('San Jose-Sunnyvale-Santa Clara, CA')).toBe('San Jose')
    expect(shortMetro('Elmira, NY')).toBe('Elmira')
  })
})

describe('titleTeaser', () => {
  it('names the highest-filing bucket whose dominant SOC is the role', () => {
    expect(titleTeaser(titles, '15-1252', 'Software Developers')).toEqual({
      fact: '“Software Engineer”',
      context: 'is what BLS counts as Software Developers',
    })
  })
  it('falls back generically when titles are missing or the role has no bucket', () => {
    expect(titleTeaser(null, '15-1252', 'Software Developers')).toEqual({
      fact: 'See what these jobs are really called',
      context: '',
    })
    expect(titleTeaser(titles, '11-3021', 'IT Managers')).toEqual({
      fact: 'See what these jobs are really called',
      context: '',
    })
  })
})

describe('payTeaser', () => {
  const metros = [metro('1', 'Cheapville, TX', 90), metro('2', 'San Jose-Sunnyvale-Santa Clara, CA', 113)]
  const salaries: Salaries = { '1': { '15-1252': row(100_000) }, '2': { '15-1252': row(210_000) } }
  it('quotes the top metro and ITS median — a number the map actually shows (honesty rule)', () => {
    expect(payTeaser(salaries, metros, '15-1252')).toEqual({
      fact: '$210,000 · San Jose',
      context: 'tops 2 metros',
      top3: [
        { city: 'San Jose', p50: 210_000 },
        { city: 'Cheapville', p50: 100_000 },
      ],
    })
  })
  it('degrades to the generic line when no metro has a median', () => {
    expect(payTeaser({}, metros, '15-1252')).toEqual({
      fact: 'Percentiles for every metro',
      context: 'on the map',
      top3: [],
    })
  })
})

describe('colTeaser', () => {
  const metros = [metro('1', 'Cheapville, TX', 90), metro('2', 'San Jose-Sunnyvale-Santa Clara, CA', 150)]
  const salaries: Salaries = { '1': { '15-1252': row(150_000) }, '2': { '15-1252': row(160_000) } }
  it('names the metro that falls furthest once adjusted', () => {
    // San Jose: nominal rank 1, adjusted 160k/1.5 ≈ 106.7k < Cheapville 150k/0.9 ≈ 166.7k → rank 2
    expect(colTeaser(metros, salaries, '15-1252', 'pay')).toEqual({
      fact: 'San Jose falls 1 place',
      context: 'once cost of living counts',
    })
  })
  it('falls back when nothing falls', () => {
    expect(colTeaser([metro('1', 'Cheapville, TX', 100)], { '1': { '15-1252': row(100_000) } }, '15-1252', 'pay'))
      .toEqual({ fact: 'Rankings flip', context: 'see who leapfrogs whom once cost of living counts' })
  })
  it('makes no ranking claim when the section is not showing the pay metric', () => {
    expect(colTeaser(metros, salaries, '15-1252', 'emp'))
      .toEqual({ fact: 'Rankings flip', context: 'see who leapfrogs whom once cost of living counts' })
  })
})

describe('trendTeaser', () => {
  it('formats the fractional changeReal as signed percent since headlineFrom', () => {
    expect(trendTeaser(trends, '15-1252')).toEqual({ fact: '−5.7% real', context: 'since 2021' })
  })
  it('is honest about a missing series', () => {
    expect(trendTeaser(null, '15-1252')).toEqual({ fact: 'Trend data unavailable', context: '' })
    expect(trendTeaser(trends, '11-3021')).toEqual({ fact: 'Trend data unavailable', context: '' })
  })
})

describe('similarTeaser', () => {
  const meta = { year: 2025, generated: '', metros: [metro('1', 'A, TX', 100)], roles: [
    { soc: '15-1252', label: 'Software Developers' }, { soc: '15-1253', label: 'QA' },
  ], topCodeValue: 0, rppYear: 2024, lcaPeriod: '' } as unknown as Meta

  it('counts every row the section will list — thin pairs included (label, never hide)', () => {
    // One shared metro: similarByPay returns the pair flagged thin; the section lists it
    // with a chip, so the teaser counts it.
    expect(similarTeaser(meta, { '1': { '15-1252': row(100_000), '15-1253': row(95_000) } }, '15-1252'))
      .toEqual({ fact: '1 role', context: 'pays like this one', topLabel: 'QA' })
  })

  it('falls back only when the section itself would be empty (zero overlap)', () => {
    // QA has no salary row anywhere → zero shared metros → similarByPay returns []
    expect(similarTeaser(meta, { '1': { '15-1252': row(100_000) } }, '15-1252'))
      .toEqual({ fact: 'Not enough overlap', context: 'to compare this role', topLabel: null })
  })
})
