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
})
