import { describe, expect, it } from 'vitest'
import { ROLES, SOC_SET, targetSoc } from '../lib/soc'
import { num } from '../lib/num'

describe('roles', () => {
  it('has 18 unique roles with labels', () => {
    expect(ROLES).toHaveLength(18)
    expect(new Set(ROLES.map(r => r.soc)).size).toBe(18)
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
})
