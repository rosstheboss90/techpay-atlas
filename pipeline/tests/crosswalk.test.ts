import { describe, expect, it } from 'vitest'
import { hudRowsToZipCbsa } from '../lib/crosswalk'

describe('hudRowsToZipCbsa', () => {
  it('picks the CBSA with the highest business ratio per ZIP and restores leading zeros', () => {
    const m = hudRowsToZipCbsa([
      { ZIP: 78701, CBSA: '12420', BUS_RATIO: '0.98', TOT_RATIO: '0.99' },
      { ZIP: 78701, CBSA: '41700', BUS_RATIO: '0.02', TOT_RATIO: '0.01' },
      { ZIP: 2139,  CBSA: '14460', BUS_RATIO: '1.0',  TOT_RATIO: '1.0' },
    ])
    expect(m.get('78701')).toBe('12420')
    expect(m.get('02139')).toBe('14460')
  })
  it('never maps a ZIP to the 99999 non-metro bucket', () => {
    const m = hudRowsToZipCbsa([{ ZIP: 99801, CBSA: '99999', BUS_RATIO: '1.0', TOT_RATIO: '1.0' }])
    expect(m.has('99801')).toBe(false)
  })
  it.each([
    [null], [''], ['Total'],
  ])('rejects junk CBSA cells (%j)', (cbsa) => {
    const m = hudRowsToZipCbsa([{ ZIP: 78701, CBSA: cbsa, BUS_RATIO: '1.0', TOT_RATIO: '1.0' }])
    expect(m.has('78701')).toBe(false)
  })
  it('breaks ties on equal score by keeping the lexicographically smaller cbsa', () => {
    const m = hudRowsToZipCbsa([
      { ZIP: 78701, CBSA: '41700', BUS_RATIO: '0.5', TOT_RATIO: '0.5' },
      { ZIP: 78701, CBSA: '12420', BUS_RATIO: '0.5', TOT_RATIO: '0.5' },
    ])
    expect(m.get('78701')).toBe('12420')
  })
  it('accepts 2024+ vintage lowercase headers with geoid in place of CBSA', () => {
    const m = hudRowsToZipCbsa([
      { zip: '00501', geoid: '35620', res_ratio: 0, bus_ratio: 1, oth_ratio: 0, tot_ratio: 1 },
    ])
    expect(m.get('00501')).toBe('35620')
  })
})
