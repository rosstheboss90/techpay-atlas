// pipeline/tests/parse-lca.test.ts
import { describe, expect, it } from 'vitest'
import { lcaRowsToRecords } from '../lib/parse-lca'

const row = (over: Record<string, unknown> = {}) => ({
  CASE_STATUS: 'Certified', FULL_TIME_POSITION: 'Y',
  EMPLOYER_NAME: '  Acme   Corp ', SOC_CODE: '15-1252.00', JOB_TITLE: 'Software Engineer II',
  WORKSITE_POSTAL_CODE: 78701, WAGE_RATE_OF_PAY_FROM: '$145,000.00', WAGE_UNIT_OF_PAY: 'Year',
  ...over,
})

describe('lcaRowsToRecords', () => {
  it('maps a certified full-time target row, normalizing employer whitespace and ZIP', () => {
    expect(lcaRowsToRecords([row()]).records).toEqual([
      { soc: '15-1252', employer: 'Acme Corp', zip: '78701', annualWage: 145000, caseNumber: '' },
    ])
  })
  it.each([
    ['Certified', true], ['CERTIFIED', true], ['certified', true],
  ])('accepts CASE_STATUS drift: %s', (status, accepted) => {
    expect(lcaRowsToRecords([row({ CASE_STATUS: status })]).records.length > 0).toBe(accepted)
  })
  it.each([
    ['Year', '145000'], ['year', '145000'], ['YEAR', '145000'],
    ['Bi-Weekly', '6000'], ['Bi-weekly', '6000'], ['BI-WEEKLY', '6000'],
  ])('accepts WAGE_UNIT_OF_PAY drift: %s', (unit, wage) => {
    expect(lcaRowsToRecords([row({ WAGE_UNIT_OF_PAY: unit, WAGE_RATE_OF_PAY_FROM: wage })]).records.length).toBe(1)
  })
  it.each([
    ['Y', true], ['Yes', true],
  ])('accepts FULL_TIME_POSITION drift: %s', (v) => {
    expect(lcaRowsToRecords([row({ FULL_TIME_POSITION: v })]).records.length).toBe(1)
  })
  it('annualizes hourly/weekly/bi-weekly/monthly wages', () => {
    expect(lcaRowsToRecords([row({ WAGE_RATE_OF_PAY_FROM: '70', WAGE_UNIT_OF_PAY: 'Hour' })]).records[0].annualWage).toBe(145600)
    expect(lcaRowsToRecords([row({ WAGE_RATE_OF_PAY_FROM: '3000', WAGE_UNIT_OF_PAY: 'Week' })]).records[0].annualWage).toBe(156000)
    expect(lcaRowsToRecords([row({ WAGE_RATE_OF_PAY_FROM: '6000', WAGE_UNIT_OF_PAY: 'Bi-Weekly' })]).records[0].annualWage).toBe(156000)
    expect(lcaRowsToRecords([row({ WAGE_RATE_OF_PAY_FROM: '12000', WAGE_UNIT_OF_PAY: 'Month' })]).records[0].annualWage).toBe(144000)
  })
  it('drops withdrawn, part-time, non-target-SOC, unknown-unit, and implausible-wage rows', () => {
    expect(lcaRowsToRecords([row({ CASE_STATUS: 'Certified - Withdrawn' })]).records).toEqual([])
    expect(lcaRowsToRecords([row({ FULL_TIME_POSITION: 'N' })]).records).toEqual([])
    expect(lcaRowsToRecords([row({ SOC_CODE: '29-1141' })]).records).toEqual([])
    expect(lcaRowsToRecords([row({ WAGE_UNIT_OF_PAY: 'Fortnight' })]).records).toEqual([])
    expect(lcaRowsToRecords([row({ WAGE_RATE_OF_PAY_FROM: '12' })]).records).toEqual([])        // $12/yr
    expect(lcaRowsToRecords([row({ WAGE_RATE_OF_PAY_FROM: '9,000,000' })]).records).toEqual([])  // $9M/yr
  })
  it('restores leading zeros on ZIPs and trims ZIP+4 (hyphenated, unhyphenated, and numeric cells)', () => {
    expect(lcaRowsToRecords([row({ WORKSITE_POSTAL_CODE: '02139-4307' })]).records[0].zip).toBe('02139')
    expect(lcaRowsToRecords([row({ WORKSITE_POSTAL_CODE: 2139 })]).records[0].zip).toBe('02139')
    expect(lcaRowsToRecords([row({ WORKSITE_POSTAL_CODE: '021394307' })]).records[0].zip).toBe('02139')
    expect(lcaRowsToRecords([row({ WORKSITE_POSTAL_CODE: 21394307 })]).records[0].zip).toBe('02139')
  })
  it('retains CASE_NUMBER, trimmed', () => {
    expect(lcaRowsToRecords([row({ CASE_NUMBER: ' I-200-12345-678901 ' })]).records[0].caseNumber).toBe('I-200-12345-678901')
  })
  describe('wage band midpoint', () => {
    it('uses the midpoint of FROM/TO when TO parses and exceeds FROM', () => {
      const r = lcaRowsToRecords([row({ WAGE_RATE_OF_PAY_FROM: '100000', WAGE_RATE_OF_PAY_TO: '150000', WAGE_UNIT_OF_PAY: 'Year' })]).records[0]
      expect(r.annualWage).toBe(125000)
    })
    it('uses FROM alone when TO is absent', () => {
      const r = lcaRowsToRecords([row({ WAGE_RATE_OF_PAY_FROM: '100000', WAGE_UNIT_OF_PAY: 'Year' })]).records[0]
      expect(r.annualWage).toBe(100000)
    })
    it('uses FROM alone when TO is junk (less than FROM)', () => {
      const r = lcaRowsToRecords([row({ WAGE_RATE_OF_PAY_FROM: '100000', WAGE_RATE_OF_PAY_TO: '50000', WAGE_UNIT_OF_PAY: 'Year' })]).records[0]
      expect(r.annualWage).toBe(100000)
    })
  })

  describe('drop accounting', () => {
    // NOTE: WORKSITE_POSTAL_CODE is digit-stripped then padded/sliced to exactly 5 digits (see
    // the ZIP-handling test above), so the /^\d{5}$/ guard can never actually fail — there is no
    // "zip" bucket trigger left. The guard and the bucket stay for defense/shape stability.
    it('buckets every dropped row by the reason it was dropped, and accepted rows drop nothing', () => {
      const rows = [
        row(),                                                    // accepted
        row({ CASE_STATUS: 'Denied' }),                           // status
        row({ FULL_TIME_POSITION: 'N' }),                         // partTime
        row({ SOC_CODE: '29-1141' }),                             // soc
        row({ WAGE_UNIT_OF_PAY: 'Fortnight' }),                   // unit
        row({ WAGE_RATE_OF_PAY_FROM: 'garbage' }),                // wage (unparseable)
        row({ WAGE_RATE_OF_PAY_FROM: '9,000,000' }),              // range (implausible)
        row({ EMPLOYER_NAME: '   ' }),                            // employer
      ]
      const { records, drops } = lcaRowsToRecords(rows)
      expect(records).toHaveLength(1)
      expect(drops).toEqual({
        status: 1, partTime: 1, soc: 1, unit: 1, wage: 1, range: 1, zip: 0, employer: 1,
      })
    })
  })
})
