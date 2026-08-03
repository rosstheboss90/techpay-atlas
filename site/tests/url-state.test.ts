import { describe, expect, it } from 'vitest'
import { parseState, serializeState, DEFAULT_STATE } from '../lib/url-state'

describe('url state', () => {
  it('round-trips', () => {
    const s = { role: '15-2051', metric: 'lq' as const, adjusted: true, metro: '12420' }
    expect(parseState(new URLSearchParams(serializeState(s)))).toEqual(s)
  })
  it('falls back to defaults for missing/invalid params', () => {
    expect(parseState(new URLSearchParams(''))).toEqual(DEFAULT_STATE)
    expect(parseState(new URLSearchParams('metric=bogus&role=99-9999'))).toEqual(DEFAULT_STATE)
  })
  it('omits default values from the query string', () => {
    expect(serializeState(DEFAULT_STATE)).toBe('')
    expect(serializeState({ ...DEFAULT_STATE, adjusted: true })).toBe('adj=1')
  })
})
