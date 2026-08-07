import { describe, expect, it } from 'vitest'
import { detectDelineation } from '../lib/delineation'
import type { MsaArchive } from '../lib/history'

const v = (year: number, areas: Record<string, string>): MsaArchive => ({
  year, topCode: 239_200, source: `MSA_M${year}_dl.xlsx`, areas,
  metros: Object.fromEntries(Object.keys(areas).map(c => [c, { '15-1252': { p50: 1, emp: 1, capped: [] } }])),
})

describe('detectDelineation', () => {
  it('reports no break when the title is stable', () => {
    const d = detectDelineation([v(2019, { '12420': 'Austin-Round Rock, TX' }), v(2020, { '12420': 'Austin-Round Rock, TX' })])
    expect(d['12420'].breaks).toEqual([])
  })

  it('reports a break in the year the title changed', () => {
    const d = detectDelineation([
      v(2019, { '12420': 'Austin-Round Rock, TX' }),
      v(2020, { '12420': 'Austin-Round Rock-Georgetown, TX' }),
    ])
    expect(d['12420'].breaks).toEqual([2020])
  })

  it('reports every break when the title changed more than once', () => {
    const d = detectDelineation([
      v(2019, { '12420': 'Austin-Round Rock, TX' }),
      v(2020, { '12420': 'Austin-Round Rock-Georgetown, TX' }),
      v(2021, { '12420': 'Austin-Round Rock-Georgetown, TX' }),
      v(2022, { '12420': 'Austin-Round Rock-San Marcos, TX' }),
    ])
    expect(d['12420'].breaks).toEqual([2020, 2022])
  })

  it('records first and last year a metro appears', () => {
    const d = detectDelineation([
      v(2019, { '10180': 'Abilene, TX' }),
      v(2020, { '10180': 'Abilene, TX', '99999': 'New Metro, XX' }),
      v(2021, { '99999': 'New Metro, XX' }),
    ])
    expect(d['10180'].firstYear).toBe(2019)
    expect(d['10180'].lastYear).toBe(2020)
    expect(d['99999'].firstYear).toBe(2020)
    expect(d['99999'].lastYear).toBe(2021)
  })

  it('a metro appearing mid-window is not a break — it is simply a later start', () => {
    const d = detectDelineation([v(2019, { '10180': 'Abilene, TX' }), v(2020, { '10180': 'Abilene, TX', '99999': 'New, XX' })])
    expect(d['99999'].breaks).toEqual([])
  })

  it('a gap in appearance is recorded so the series can break there', () => {
    const d = detectDelineation([
      v(2019, { '10180': 'Abilene, TX' }),
      v(2020, {}),
      v(2021, { '10180': 'Abilene, TX' }),
    ])
    expect(d['10180'].absentYears).toEqual([2020])
  })

  it('sorts vintages by year regardless of input order', () => {
    const d = detectDelineation([
      v(2021, { '12420': 'Austin-Round Rock-San Marcos, TX' }),
      v(2019, { '12420': 'Austin-Round Rock, TX' }),
    ])
    expect(d['12420'].breaks).toEqual([2021])
    expect(d['12420'].firstYear).toBe(2019)
  })
})
