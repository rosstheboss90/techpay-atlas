import { describe, expect, it } from 'vitest'
import { fmtUsd, fmtUsdCompact, fmtNum } from '../lib/format'

describe('format', () => {
  it('formats dollars', () => {
    expect(fmtUsd(134120)).toBe('$134,120')
    expect(fmtUsdCompact(134120)).toBe('$134k')
    expect(fmtUsdCompact(1503000)).toBe('$1.5M')
  })
  it('formats counts and handles null as em-dash', () => {
    expect(fmtNum(31960)).toBe('31,960')
    expect(fmtUsd(null)).toBe('—')
    expect(fmtNum(null)).toBe('—')
  })
})
