import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Regression lock for docs/BACKLOG.md 2026-08-09 🔴: these archive cells ARE
// p50-censored in the committed history. If a re-archive ever loses the flag,
// the metro-trend fix (build-metro-trends) silently regresses to plotting floors.
const arch = (year: number) =>
  JSON.parse(readFileSync(path.join('data', 'history', `oews-msa-${year}.json`), 'utf8'))

describe('censored-medians archive lock', () => {
  it('San Jose (41940) 11-3021 is p50-capped in 2020, 2021, 2023, 2024', () => {
    for (const year of [2020, 2021, 2023, 2024]) {
      expect(arch(year).metros['41940']['11-3021'].capped, `year ${year}`).toContain('p50')
    }
  })
  it('the capped value equals that vintage top-code, i.e. it is a floor, not a measurement', () => {
    const a = arch(2020)
    expect(a.topCode).toBe(208000)
    expect(a.metros['41940']['11-3021'].p50).toBe(208000)
  })
  it('Phoenix (38060) 15-1221 in 2021 and Santa Maria (42200) 15-1221 in 2022 are p50-capped', () => {
    expect(arch(2021).metros['38060']['15-1221'].capped).toContain('p50')
    expect(arch(2022).metros['42200']['15-1221'].capped).toContain('p50')
  })
})
