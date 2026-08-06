import { describe, expect, it } from 'vitest'
import { parseCpiMayByYear } from '../lib/parse-cpi'

const SERIES_ID = 'CUUR0000SA0'

// Shaped after the real api.bls.gov v1 response (abridged from an actual reply captured
// 2026-08-06). Deliberately includes the three cases the parser must handle: a normal month,
// the M13 annual average (not a month), and a "-" unavailable marker (the 2025 appropriations
// lapse produced these for BLS series generally).
const response = (overrides: Record<string, unknown> = {}) => ({
  status: 'REQUEST_SUCCEEDED',
  responseTime: 70,
  message: [] as string[],
  Results: {
    series: [{
      seriesID: SERIES_ID,
      data: [
        { year: '2025', period: 'M12', periodName: 'December', value: '324.054', footnotes: [{}] },
        { year: '2025', period: 'M10', periodName: 'October', value: '-', footnotes: [{ code: 'X', text: 'Data unavailable due to the 2025 lapse in appropriations' }] },
        { year: '2025', period: 'M05', periodName: 'May', value: '321.465', footnotes: [{}] },
        { year: '2025', period: 'M13', periodName: 'Annual', value: '318.700', footnotes: [{}] },
        { year: '2024', period: 'M05', periodName: 'May', value: '313.225', footnotes: [{}] },
        { year: '2024', period: 'M01', periodName: 'January', value: '308.417', footnotes: [{}] },
      ],
    }],
  },
  ...overrides,
})

describe('parseCpiMayByYear', () => {
  it('returns only the M05 observations for the requested series, keyed by year', () => {
    expect(parseCpiMayByYear(response(), SERIES_ID)).toEqual({ 2025: 321.465, 2024: 313.225 })
  })

  it('ignores M13 (annual average) — it is not a month', () => {
    const out = parseCpiMayByYear(response(), SERIES_ID)
    expect(Object.values(out)).not.toContain(318.700)
  })

  it('ignores other periods (M12, M10, M01)', () => {
    const out = parseCpiMayByYear(response(), SERIES_ID)
    expect(Object.values(out)).not.toContain(324.054)
    expect(Object.values(out)).not.toContain(308.417)
  })

  it('throws if status is not REQUEST_SUCCEEDED, including the message array', () => {
    const bad = response({ status: 'REQUEST_NOT_PROCESSED', message: ['unable to get the requested data'] })
    expect(() => parseCpiMayByYear(bad, SERIES_ID)).toThrow(/unable to get the requested data/)
  })

  it('throws if the requested series is absent from Results.series', () => {
    expect(() => parseCpiMayByYear(response(), 'CUUR0000SA0LE')).toThrow(/CUUR0000SA0LE/)
  })

  it('throws on a "-" unavailable marker rather than coercing to NaN or 0', () => {
    const withGap = response({
      Results: {
        series: [{
          seriesID: SERIES_ID,
          data: [{ year: '2025', period: 'M05', periodName: 'May', value: '-', footnotes: [{ code: 'X', text: 'unavailable' }] }],
        }],
      },
    })
    expect(() => parseCpiMayByYear(withGap, SERIES_ID)).toThrow(/2025/)
    expect(() => parseCpiMayByYear(withGap, SERIES_ID)).toThrow(/M05/)
  })

  it('throws on any other unparseable value', () => {
    const garbled = response({
      Results: {
        series: [{
          seriesID: SERIES_ID,
          data: [{ year: '2025', period: 'M05', periodName: 'May', value: 'N/A', footnotes: [{}] }],
        }],
      },
    })
    expect(() => parseCpiMayByYear(garbled, SERIES_ID)).toThrow()
  })

  it('throws if there are no May observations at all', () => {
    const noMay = response({
      Results: {
        series: [{
          seriesID: SERIES_ID,
          data: [{ year: '2025', period: 'M12', periodName: 'December', value: '324.054', footnotes: [{}] }],
        }],
      },
    })
    expect(() => parseCpiMayByYear(noMay, SERIES_ID)).toThrow(/May/)
  })
})
