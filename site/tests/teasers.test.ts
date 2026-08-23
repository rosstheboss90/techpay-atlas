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
      fact: 'Job ads say “Software Engineer” — the statistics say Software Developers.',
      context: '',
    })
  })
  it('falls back generically when titles are missing or the role has no bucket', () => {
    expect(titleTeaser(null, '15-1252', 'Software Developers')).toEqual({
      fact: 'Real titles, mapped to the official codes.',
      context: '',
    })
    expect(titleTeaser(titles, '11-3021', 'IT Managers')).toEqual({
      fact: 'Real titles, mapped to the official codes.',
      context: '',
    })
  })
})

describe('payTeaser', () => {
  const metros = [metro('1', 'Cheapville, TX', 90), metro('2', 'San Jose-Sunnyvale-Santa Clara, CA', 113)]
  const salaries: Salaries = { '1': { '15-1252': row(100_000) }, '2': { '15-1252': row(210_000) } }
  it('quotes the top metro and ITS median — a number the map actually shows (honesty rule)', () => {
    expect(payTeaser(salaries, metros, '15-1252', false)).toEqual({
      fact: 'San Jose tops the map at $210,000.',
      context: '',
      top3: [
        { city: 'San Jose', p50: 210_000 },
        { city: 'Cheapville', p50: 100_000 },
      ],
    })
  })
  it('degrades to the generic line when no metro has a median', () => {
    expect(payTeaser({}, metros, '15-1252', false)).toEqual({
      fact: 'Percentiles for every metro on the map.',
      context: '',
      top3: [],
    })
  })
  it('truncates top3 to 3 entries, p50 desc, while context counts every metro', () => {
    const metros4 = [
      metro('1', 'Cheapville, TX', 90),
      metro('2', 'San Jose-Sunnyvale-Santa Clara, CA', 113),
      metro('3', 'Seattle-Tacoma-Bellevue, WA', 120),
      metro('4', 'Austin-Round Rock, TX', 100),
    ]
    const salaries4: Salaries = {
      '1': { '15-1252': row(90_000) },
      '2': { '15-1252': row(210_000) },
      '3': { '15-1252': row(250_000) },
      '4': { '15-1252': row(100_000) },
    }
    expect(payTeaser(salaries4, metros4, '15-1252', false)).toEqual({
      fact: 'Seattle tops the map at $250,000.',
      context: '',
      top3: [
        { city: 'Seattle', p50: 250_000 },
        { city: 'San Jose', p50: 210_000 },
        { city: 'Austin', p50: 100_000 },
      ],
    })
  })
})

describe('payTeaser cost-of-living agreement', () => {
  const metros = [
    { cbsa: 'A', name: 'Expensive City, CA', state: 'CA', lat: 0, lng: 0, rpp: 130, lcaFilings: 0 },
    { cbsa: 'B', name: 'Cheap City, TX', state: 'TX', lat: 0, lng: 0, rpp: 90, lcaFilings: 0 },
  ]
  const salaries = {
    A: { S: { emp: 1, lq: 1, p10: 1, p25: 1, p50: 200000, p75: 1, p90: 1 } },
    B: { S: { emp: 1, lq: 1, p10: 1, p25: 1, p50: 160000, p75: 1, p90: 1 } },
  } as never

  it('nominal mode names the highest raw payer', () => {
    expect(payTeaser(salaries, metros as never, 'S', false).fact)
      .toBe('Expensive City tops the map at $200,000.')
  })

  it('adjusted mode names the highest COL-adjusted payer — the one the map recolours as top', () => {
    // A: 200000/1.30 = 153,846 · B: 160000/0.90 = 177,778 → B wins once RPP counts.
    const t = payTeaser(salaries, metros as never, 'S', true)
    expect(t.fact).toBe('Cheap City tops the map at $177,778.')
    expect(t.top3[0].city).toBe('Cheap City')
  })

  it('falls back when no metro has a median for the role', () => {
    expect(payTeaser({} as never, metros as never, 'S', true))
      .toMatchObject({ fact: 'Percentiles for every metro on the map.', top3: [] })
  })
})

describe('colTeaser', () => {
  const metros = [metro('1', 'Cheapville, TX', 90), metro('2', 'San Jose-Sunnyvale-Santa Clara, CA', 150)]
  const salaries: Salaries = { '1': { '15-1252': row(150_000) }, '2': { '15-1252': row(160_000) } }
  it('names the metro that falls furthest once adjusted', () => {
    // San Jose: nominal rank 1, adjusted 160k/1.5 ≈ 106.7k < Cheapville 150k/0.9 ≈ 166.7k → rank 2
    expect(colTeaser(metros, salaries, '15-1252', 'pay')).toEqual({
      fact: 'San Jose falls 1 place once cost of living counts.',
      context: '',
    })
  })
  it('falls back when nothing falls', () => {
    expect(colTeaser([metro('1', 'Cheapville, TX', 100)], { '1': { '15-1252': row(100_000) } }, '15-1252', 'pay'))
      .toEqual({ fact: 'See who leapfrogs whom once cost of living counts.', context: '' })
  })
  it('makes no ranking claim when the section is not showing the pay metric', () => {
    expect(colTeaser(metros, salaries, '15-1252', 'emp'))
      .toEqual({ fact: 'See who leapfrogs whom once cost of living counts.', context: '' })
  })
  it('pluralizes "places" when the faller drops more than one place', () => {
    const metros3 = [
      metro('1', 'Metroville, AA', 300),
      metro('2', 'Bigcity, BB', 100),
      metro('3', 'Smalltown, CC', 100),
    ]
    const salaries3: Salaries = {
      '1': { '15-1252': row(300_000) },
      '2': { '15-1252': row(200_000) },
      '3': { '15-1252': row(150_000) },
    }
    // Nominal (p50 desc): Metroville 300k #1, Bigcity 200k #2, Smalltown 150k #3.
    // Adjusted (p50 / (rpp/100)): Metroville 300k/3 = 100k, Bigcity 200k/1 = 200k, Smalltown 150k/1 = 150k
    // → adjusted desc: Bigcity #1, Smalltown #2, Metroville #3.
    // Metroville: nominalRank 1, adjustedRank 3, delta = 1 − 3 = −2 → falls 2 places.
    expect(colTeaser(metros3, salaries3, '15-1252', 'pay')).toEqual({
      fact: 'Metroville falls 2 places once cost of living counts.',
      context: '',
    })
  })
})

describe('trendTeaser', () => {
  it('formats the fractional changeReal as a "down" sentence since headlineFrom', () => {
    expect(trendTeaser(trends, '15-1252', 'Software Developers')).toEqual({
      fact: 'Software Developers are down 5.7% in real terms since 2021.',
      context: '',
    })
  })
  it('is honest about a missing series', () => {
    expect(trendTeaser(null, '15-1252', 'Software Developers')).toEqual({ fact: 'Trend data unavailable.', context: '' })
    expect(trendTeaser(trends, '11-3021', 'IT Managers')).toEqual({ fact: 'Trend data unavailable.', context: '' })
  })
  it('signs a positive real change as an "up" sentence', () => {
    const trendsUp: TrendsJson = {
      ...trends,
      roles: { '15-1252': { ...trends.roles['15-1252'], changeReal: 0.031 } },
    }
    expect(trendTeaser(trendsUp, '15-1252', 'Software Developers')).toEqual({
      fact: 'Software Developers are up 3.1% in real terms since 2021.',
      context: '',
    })
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
      .toEqual({ fact: '1 role pays like this one.', context: '', topLabel: 'QA', count: 1 })
  })

  it('falls back only when the section itself would be empty (zero overlap)', () => {
    // QA has no salary row anywhere → zero shared metros → similarByPay returns []
    expect(similarTeaser(meta, { '1': { '15-1252': row(100_000) } }, '15-1252'))
      .toEqual({ fact: 'Not enough overlap to compare this role.', context: '', topLabel: null, count: 0 })
  })

  it('pluralizes "roles"/"pay" when more than one role overlaps, topLabel is the best match', () => {
    const meta3 = { year: 2025, generated: '', metros: [metro('1', 'A, TX', 100)], roles: [
      { soc: '15-1252', label: 'Software Developers' },
      { soc: '15-1253', label: 'QA' },
      { soc: '15-1254', label: 'DevOps' },
    ], topCodeValue: 0, rppYear: 2024, lcaPeriod: '' } as unknown as Meta
    // overlap(QA) = min(100k,95k)/max = 0.95; overlap(DevOps) = min(100k,80k)/max = 0.8
    // → sorted overlap desc: QA then DevOps; topLabel is QA's; count is both (the "+N more" chip
    // math on the page is count - 1).
    expect(similarTeaser(meta3, {
      '1': { '15-1252': row(100_000), '15-1253': row(95_000), '15-1254': row(80_000) },
    }, '15-1252')).toEqual({ fact: '2 roles pay like this one.', context: '', topLabel: 'QA', count: 2 })
  })
})
