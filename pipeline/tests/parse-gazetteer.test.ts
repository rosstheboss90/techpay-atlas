import { describe, expect, it } from 'vitest'
import { gazetteerRowsToMap } from '../lib/parse-gazetteer'

describe('gazetteerRowsToMap', () => {
  it('maps CBSA to trimmed coordinates (headers may carry trailing spaces)', () => {
    const m = gazetteerRowsToMap([
      { GEOID: '12420', NAME: 'Austin-Round Rock-San Marcos, TX Metro Area', 'INTPTLAT': '30.309219', 'INTPTLONG   ': '-97.756934   ' },
    ])
    expect(m.get('12420')).toEqual({ lat: 30.309219, lng: -97.756934 })
  })
  it('skips rows with unparseable coordinates', () => {
    expect(gazetteerRowsToMap([{ GEOID: 'x', NAME: 'y', INTPTLAT: '', INTPTLONG: '' }]).size).toBe(0)
  })
})
