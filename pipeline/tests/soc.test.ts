import { describe, expect, it } from 'vitest'
import { ROLES, SOC_SET, targetSoc } from '../lib/soc'
import { cell, num, TOP_CODE } from '../lib/num'

describe('roles', () => {
  it('has 21 unique roles with labels', () => {
    expect(ROLES).toHaveLength(21)
    expect(new Set(ROLES.map(r => r.soc)).size).toBe(21)
    for (const r of ROLES) expect(r.label.length).toBeGreaterThan(0)
  })
  it('targetSoc normalizes O*NET suffixes and rejects non-targets', () => {
    expect(targetSoc('15-1252.00')).toBe('15-1252')
    expect(targetSoc(' 11-3021 ')).toBe('11-3021')
    expect(targetSoc('29-1141')).toBeNull()
    expect(targetSoc('garbage')).toBeNull()
  })
})

describe('num', () => {
  it('parses currency strings and rejects OEWS suppression markers', () => {
    expect(num('$123,456')).toBe(123456)
    expect(num(88)).toBe(88)
    expect(num('*')).toBeNull()
    expect(num('**')).toBeNull()
    expect(num('#')).toBeNull()
    expect(num('')).toBeNull()
    expect(num(null)).toBeNull()
  })
  it('rejects values Number() would otherwise mis-parse (scientific notation, stray letters, multiple decimals)', () => {
    expect(num('5e10')).toBeNull()       // Number('5e10') is 50_000_000_000 -- not a real wage/count cell
    expect(num('123abc')).toBeNull()
    expect(num('1.2.3')).toBeNull()
    expect(num('+45')).toBeNull()
  })
  it('still accepts legitimately comma-grouped numbers', () => {
    expect(num('1,234,567')).toBe(1234567)
  })
})

describe('cell', () => {
  it('treats # as a top-code, not suppression', () => {
    expect(cell('#')).toEqual({ value: TOP_CODE, capped: true })
    expect(cell('$#')).toEqual({ value: TOP_CODE, capped: true })
    expect(TOP_CODE).toBe(239_200)
  })
  it('delegates non-# cells to num', () => {
    expect(cell('$123,456')).toEqual({ value: 123456, capped: false })
    expect(cell('*')).toEqual({ value: null, capped: false })
    expect(cell('**')).toEqual({ value: null, capped: false })
    expect(cell('')).toEqual({ value: null, capped: false })
  })
})
