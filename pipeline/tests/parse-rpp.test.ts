import { describe, expect, it } from 'vitest'
import { rppRowsToMap } from '../lib/parse-rpp'

const rows = [
  { GeoFIPS: '"12420"', GeoName: 'Austin-Round Rock, TX', LineCode: '1', Description: 'RPPs: All items', '2022': '104.1', '2023': '103.6' },
  { GeoFIPS: '"12420"', GeoName: 'Austin-Round Rock, TX', LineCode: '2', Description: 'RPPs: Goods', '2022': '99.0', '2023': '98.7' },
  { GeoFIPS: '"19100"', GeoName: 'Dallas-Fort Worth, TX', LineCode: '1', Description: 'RPPs: All items', '2022': '101.9', '2023': '(NA)' },
  { GeoFIPS: '"00998"', GeoName: 'United States (Metropolitan Portion)', LineCode: '1', Description: 'RPPs: All items', '2022': '100.5', '2023': '100.4' },
]

describe('rppRowsToMap', () => {
  it('keeps only All-items lines, latest year with data, real CBSAs', () => {
    const m = rppRowsToMap(rows)
    expect(m.get('12420')).toBe(103.6)
    expect(m.get('19100')).toBe(101.9) // 2023 is (NA) -> falls back to 2022
    expect(m.has('00998')).toBe(false) // aggregate line, not a CBSA
    expect(m.size).toBe(2)
  })
})
