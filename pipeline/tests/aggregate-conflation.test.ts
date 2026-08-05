import { describe, expect, it } from 'vitest'
import { aggregateConflation } from '../lib/aggregate-conflation'

const rec = (title: string, soc: string) => ({ title, soc })

// "SOFTWARE ENGINEER" (+ variants) filed under two SOCs; "DATA SCIENTIST" under one; a rare title.
function build(n: number, title: string, soc: string) {
  return Array.from({ length: n }, () => rec(title, soc))
}
const records = [
  ...build(60, 'SOFTWARE ENGINEER', '15-1252'),
  ...build(20, 'SR. SOFTWARE ENGINEER II', '15-1252'), // normalizes to SOFTWARE ENGINEER
  ...build(20, 'STAFF SOFTWARE ENGINEER', '15-1211'),   // same title, different SOC
  ...build(70, 'DATA SCIENTIST', '15-2051'),
  ...build(3, 'CHIEF WIZARD', '15-1299'),                // below minFilings
]

describe('aggregateConflation', () => {
  it('merges title variants before counting and ranks titles by filings', () => {
    const agg = aggregateConflation(records, { minFilings: 10 })
    // SOFTWARE ENGINEER = 60+20+20 = 100 filings > DATA SCIENTIST 70
    expect(agg.titles.map(t => t.title)).toEqual(['SOFTWARE ENGINEER', 'DATA SCIENTIST'])
    expect(agg.titles[0].filings).toBe(100)
  })

  it('emits the per-title SOC distribution with shares summing to 1 and a socCount', () => {
    const se = aggregateConflation(records, { minFilings: 10 }).titles[0]
    expect(se.socCount).toBe(2)
    expect(se.socs).toEqual([
      { soc: '15-1252', filings: 80, share: 0.8 },
      { soc: '15-1211', filings: 20, share: 0.2 },
    ])
    expect(se.socs.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 10)
  })

  it('aggregates SOCs beyond topSocs into an "other" bucket', () => {
    const recs = [
      ...build(50, 'ENGINEER', '15-1252'), ...build(40, 'ENGINEER', '15-1211'),
      ...build(30, 'ENGINEER', '15-1299'), ...build(20, 'ENGINEER', '15-1241'),
    ]
    const t = aggregateConflation(recs, { minFilings: 10, topSocs: 2 }).titles[0]
    expect(t.socs.map(s => s.soc)).toEqual(['15-1252', '15-1211', 'other'])
    expect(t.socs.find(s => s.soc === 'other')!.filings).toBe(50) // 30 + 20
    expect(t.socCount).toBe(4)
  })

  it('drops titles below minFilings and reports distinct-title count', () => {
    const agg = aggregateConflation(records, { minFilings: 10 })
    expect(agg.titles.map(t => t.title)).not.toContain('CHIEF WIZARD')
    expect(agg.distinctTitles).toBe(3) // SOFTWARE ENGINEER, DATA SCIENTIST, CHIEF WIZARD (pre-filter)
  })
})
