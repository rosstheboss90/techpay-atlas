import { describe, expect, it } from 'vitest'
import { OEWS_NAT_YEARS, topCodeForYear, VINTAGES } from '../vintages'

describe('VINTAGES', () => {
  it('names the current vintage of every source the pipeline downloads', () => {
    expect(VINTAGES.oewsYear).toBeGreaterThanOrEqual(2025)
    expect(VINTAGES.lcaFiscalYear).toBeGreaterThanOrEqual(2025)
    expect(VINTAGES.gazetteerYear).toBeGreaterThanOrEqual(2025)
    expect(VINTAGES.hudStamp).toMatch(/^\d{6}$/) // MMYYYY
  })
})

describe('OEWS_NAT_YEARS', () => {
  it('covers the spec window May 2019 -> the current OEWS vintage, with no gaps', () => {
    expect(OEWS_NAT_YEARS[0]).toBe(2019)
    expect(OEWS_NAT_YEARS[OEWS_NAT_YEARS.length - 1]).toBe(VINTAGES.oewsYear)
    for (let i = 1; i < OEWS_NAT_YEARS.length; i++) {
      expect(OEWS_NAT_YEARS[i] - OEWS_NAT_YEARS[i - 1]).toBe(1)
    }
  })
})

describe('topCodeForYear', () => {
  it('returns a top code for every archived vintage', () => {
    for (const y of OEWS_NAT_YEARS) expect(topCodeForYear(y)).toBeGreaterThan(0)
  })
  it('throws for a vintage with no recorded top code rather than guessing', () => {
    expect(() => topCodeForYear(1999)).toThrow(/no OEWS top code recorded for vintage 1999/)
  })
  it('never silently reuses the current top code for an older vintage', () => {
    // Regression guard for T2: parsing a 2019 file with 2025's $239,200 rewrites that year's
    // censored cells upward and manufactures a real-terms decline at the top end.
    expect(topCodeForYear(2019)).toBeLessThan(topCodeForYear(VINTAGES.oewsYear))
  })
})
