import { describe, expect, it } from 'vitest'
import { parseState, serializeState, DEFAULT_STATE } from '../lib/url-state'

describe('url state', () => {
  it('round-trips (incl. the compare metro)', () => {
    const s = { role: '15-2051', metric: 'lq' as const, adjusted: true, metro: '12420', vs: '19100' }
    expect(parseState(new URLSearchParams(serializeState(s)))).toEqual(s)
  })
  it('falls back to defaults for missing/invalid params', () => {
    expect(parseState(new URLSearchParams(''))).toEqual(DEFAULT_STATE)
    expect(parseState(new URLSearchParams('metric=bogus&role=garbage&vs=nope'))).toEqual(DEFAULT_STATE)
  })
  it('accepts any shape-valid role (membership is gated by the page against meta.roles)', () => {
    expect(parseState(new URLSearchParams('role=99-9999')).role).toBe('99-9999')
    expect(parseState(new URLSearchParams('role=13-1082')).role).toBe('13-1082')
  })
  it('validates vs as a 5-digit CBSA, else null', () => {
    expect(parseState(new URLSearchParams('vs=41860')).vs).toBe('41860')
    expect(parseState(new URLSearchParams('vs=123')).vs).toBeNull()
  })
  it('omits default values from the query string', () => {
    expect(serializeState(DEFAULT_STATE)).toBe('')
    expect(serializeState({ ...DEFAULT_STATE, adjusted: true })).toBe('adj=1')
    expect(serializeState({ ...DEFAULT_STATE, vs: '19100' })).toBe('vs=19100')
  })
  it('pins the serialized param order for bookmarked URLs', () => {
    expect(serializeState({ role: '15-2051', metric: 'lq', adjusted: true, metro: '12420', vs: '19100' }))
      .toBe('role=15-2051&metric=lq&adj=1&metro=12420&vs=19100')
  })
})
