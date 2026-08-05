import { describe, expect, it } from 'vitest'
import type { MetroMeta, Salaries, SalaryRow } from '../lib/types'
import { columnDomain, inkOn, sortMetros, topMetrosByEmployment } from '../lib/heatmap'
import { RAMP_LIGHT, RAMP_DARK } from '../lib/map-scales'

const metro = (cbsa: string, name: string, rpp: number | null = 100): MetroMeta =>
  ({ cbsa, name, state: name.slice(-2), lat: 0, lng: 0, rpp, lcaFilings: 0 })

// A: big employment; B: medium; C: small (and rpp-null). S1/S2/S3 roles.
const A = metro('AAAAA', 'Alpha, AA'), B = metro('BBBBB', 'Bravo, BB'), C = metro('CCCCC', 'Cee, CC', null)
const metros = [A, B, C]

const row = (emp: number | null, p50: number | null, lq: number | null = 1, capped = false): SalaryRow =>
  ({ emp, lq, p10: null, p25: null, p50, p75: null, p90: null, ...(capped ? { capped: ['p50'] } : {}) })

const salaries: Salaries = {
  AAAAA: { S1: row(100, 200_000), S2: row(50, 90_000), S3: row(10, 150_000, 1, true) },
  BBBBB: { S1: row(200, 100_000), S2: row(40, 500_000) /* S3 suppressed */ },
  CCCCC: { S1: row(300, 180_000), S2: row(30, 80_000) },
}

describe('topMetrosByEmployment', () => {
  it('ranks by summed employment across roles, desc, and slices to n', () => {
    // totals: A=160, B=240, C=330 -> C, B, A
    expect(topMetrosByEmployment(metros, salaries, 2).map(m => m.cbsa)).toEqual(['CCCCC', 'BBBBB'])
  })
  it('sorts a metro with no salary rows last, tie-breaking by cbsa', () => {
    const D = metro('DDDDD', 'Dee, DD') // absent from salaries -> total 0
    const E = metro('EEEEE', 'Eee, EE') // absent -> total 0, tie with D
    const ranked = topMetrosByEmployment([...metros, E, D], salaries, 5).map(m => m.cbsa)
    expect(ranked).toEqual(['CCCCC', 'BBBBB', 'AAAAA', 'DDDDD', 'EEEEE']) // D before E on cbsa tie
  })
})

describe('columnDomain', () => {
  it('is per-column: S1 domain ignores S2 values even when S2 holds the grid-wide max', () => {
    expect(columnDomain(metros, salaries, 'S1', 'pay', false)).toEqual([100_000, 200_000])
    expect(columnDomain(metros, salaries, 'S2', 'pay', false)).toEqual([80_000, 500_000])
  })
  it('excludes suppressed cells; returns null for an all-empty column', () => {
    expect(columnDomain(metros, salaries, 'S3', 'pay', false)).toEqual([150_000, 150_000]) // only A has S3
    expect(columnDomain(metros, salaries, 'S9', 'pay', false)).toBeNull()
  })
  it('excludes rpp-null metros from the adjusted-pay domain', () => {
    // adjusted pay: C (rpp null) drops out of S1; A=200k/1.0, B=100k/1.0 remain
    expect(columnDomain(metros, salaries, 'S1', 'pay', true)).toEqual([100_000, 200_000])
  })
})

describe('inkOn', () => {
  it('picks dark ink on the pale ramp end and light ink on the dark end, in both ramps', () => {
    expect(inkOn(RAMP_LIGHT[0])).toBe('#0c1016') // palest light-ramp step
    expect(inkOn(RAMP_LIGHT[RAMP_LIGHT.length - 1])).toBe('#f2f5f8') // darkest light-ramp step
    expect(inkOn(RAMP_DARK[0])).toBe('#f2f5f8') // darkest dark-ramp step
    expect(inkOn(RAMP_DARK[RAMP_DARK.length - 1])).toBe('#0c1016') // lightest dark-ramp step
  })
})

describe('sortMetros', () => {
  it('orders by a role value desc, nulls last', () => {
    // S3 present only for A -> A first, then B/C null tie-broken by name
    expect(sortMetros(metros, salaries, 'S3', 'pay', false, 'desc').map(m => m.cbsa)).toEqual(['AAAAA', 'BBBBB', 'CCCCC'])
  })
  it('keeps nulls last even when ascending', () => {
    expect(sortMetros(metros, salaries, 'S3', 'pay', false, 'asc').map(m => m.cbsa)).toEqual(['AAAAA', 'BBBBB', 'CCCCC'])
  })
})
