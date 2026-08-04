import { describe, expect, it } from 'vitest'
import { parseState, serializeState, DEFAULT_STATE } from '../lib/url-state'

describe('url state', () => {
  it('round-trips', () => {
    const s = { role: '15-2051', metric: 'lq' as const, adjusted: true, metro: '12420' }
    expect(parseState(new URLSearchParams(serializeState(s)))).toEqual(s)
  })
  it('falls back to defaults for missing/invalid params', () => {
    expect(parseState(new URLSearchParams(''))).toEqual(DEFAULT_STATE)
    expect(parseState(new URLSearchParams('metric=bogus&role=garbage'))).toEqual(DEFAULT_STATE)
  })
  it('accepts any shape-valid role (membership is gated by the page against meta.roles)', () => {
    expect(parseState(new URLSearchParams('role=99-9999')).role).toBe('99-9999')
    expect(parseState(new URLSearchParams('role=13-1082')).role).toBe('13-1082')
  })
  it('omits default values from the query string', () => {
    expect(serializeState(DEFAULT_STATE)).toBe('')
    expect(serializeState({ ...DEFAULT_STATE, adjusted: true })).toBe('adj=1')
  })
  it('pins the serialized param order for bookmarked URLs', () => {
    expect(serializeState({ role: '15-2051', metric: 'lq', adjusted: true, metro: '12420' }))
      .toBe('role=15-2051&metric=lq&adj=1&metro=12420')
  })
})
