import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MetroPanel } from '../components/MetroPanel'
import type { Meta } from '../lib/types'
import type { MetroTrendData } from '../lib/metro-trend-types'
import type { TrendsJson } from '../lib/trends-types'

const meta = {
  year: 2025, generated: '2026-08-03T00:00:00Z', topCodeValue: 239200, rppYear: 2024,
  lcaPeriod: 'FY2025 Q1–Q4', sources: { oews: 'x', lca: [], hud: 'x', zipMatchRate: 0.99 },
  roles: [{ soc: '15-1252', label: 'Software Developers', short: 'SWE' }],
  metros: [
    { cbsa: '12420', name: 'Austin-Round Rock-San Marcos, TX', state: 'TX', lat: 30, lng: -97, rpp: 98.066, lcaFilings: 13136, trendYears: 7 },
    { cbsa: '99991', name: 'Nowhere, ZZ', state: 'ZZ', lat: 40, lng: -100, rpp: null, lcaFilings: 0, trendYears: 0 },
  ],
} satisfies Meta

const salaries = {
  '12420': { '15-1252': { emp: 31960, lq: 2.28, p10: 96110, p25: 104000, p50: 134120, p75: 168730, p90: 209890 } },
  '99991': { '15-1252': { emp: 100, lq: 0.5, p10: 58200, p25: 66900, p50: 79380, p75: 94500, p90: 112300 } },
}

// A non-trivial trend: a suppression gap at 2021 AND a delineation break at 2023, so the segment
// count exercised by the panel-level render is not 1.
const trend: MetroTrendData = {
  cbsa: '12420', name: 'Austin-Round Rock-San Marcos, TX',
  years: [2019, 2020, 2021, 2022, 2023, 2024, 2025],
  breaks: [{ year: 2023, from: 'Austin-Round Rock, TX', to: 'Austin-Round Rock-San Marcos, TX' }],
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2025 },
  roles: {
    '15-1252': {
      nominal: [100000, 105000, null, 118000, 120000, 128000, 134120],
      real: [118000, 121000, null, 123000, 120000, 126000, 134120],
      capped: [false, false, false, false, false, false, false],
    },
  },
}

const national: TrendsJson = {
  years: [2019, 2020, 2021, 2022, 2023, 2024, 2025],
  headlineFrom: 2019, headlineTo: 2025,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2025 },
  roles: {
    '15-1252': {
      label: 'Software Developers', short: 'SWE', firstYear: 2019,
      nominal: [90000, 92000, 95000, 100000, 108000, 112000, 118000],
      real: [100000, 101000, 100500, 104000, 109000, 111000, 118000],
      emp: [1, 1, 1, 1, 1, 1, 1],
      cappedP90: [false, false, false, false, false, false, false],
      changeReal: 0.18,
    },
  },
  skippedRoles: [], breaks: [],
}

// Preserve the real loadEmployers (the existing three tests already exercise it via a stubbed
// global fetch); only loadMetroTrend is replaced, so it can be asserted on/rejected per test the
// same way trends-page.test.tsx does for loadTrends.
vi.mock('../lib/data', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/data')>()
  return { ...actual, loadMetroTrend: vi.fn(async () => trend) }
})

describe('MetroPanel', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('shows headline stats and fetches employers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cbsa: '12420', roles: { '15-1252': { employers: [{ name: 'Amazon.com Services LLC', filings: 583, median: 152100 }], sample: [1, 2], n: 600, p99: 250000 } } }),
    }))
    render(<MetroPanel meta={meta} salaries={salaries} cbsa="12420" soc="15-1252" adjusted={false} national={national} onClose={() => {}} />)
    expect(screen.getByText(/Austin-Round Rock/)).toBeInTheDocument()
    expect(screen.getAllByText('$134,120').length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.getByText(/Amazon\.com Services LLC/)).toBeInTheDocument())
    expect(screen.getByText(/583 filings/)).toBeInTheDocument()
  })

  it('lcaFilings 0 -> renders no-filings note and never fetches', () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    render(<MetroPanel meta={meta} salaries={salaries} cbsa="99991" soc="15-1252" adjusted={false} national={national} onClose={() => {}} />)
    expect(screen.getByText(/No H-1B filings on record/)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('adjusted mode with null rpp -> explains AND still shows nominal numbers (not dashes)', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<MetroPanel meta={meta} salaries={salaries} cbsa="99991" soc="15-1252" adjusted={true} national={national} onClose={() => {}} />)
    expect(screen.getByText(/no cost-of-living index/i)).toBeInTheDocument()
    expect(screen.getAllByText('$79,380').length).toBeGreaterThan(0)
  })

  it('trendYears 0 -> renders no-history note and never fetches the trend', async () => {
    const { loadMetroTrend } = await import('../lib/data')
    vi.mocked(loadMetroTrend).mockClear()
    render(<MetroPanel meta={meta} salaries={salaries} cbsa="99991" soc="15-1252" adjusted={false} national={national} onClose={() => {}} />)
    expect(screen.getByText(/no published history/i)).toBeInTheDocument()
    expect(loadMetroTrend).not.toHaveBeenCalled()
  })

  it('trendYears undefined -> renders no trend section at all', async () => {
    // undefined means the pipeline has not emitted the metro-trend dataset yet, so the feature is
    // not live. Claiming "no published history" on every metro would be false — the history exists
    // and simply has not been built. This is distinct from trendYears === 0, which is a real fact
    // about one metro.
    const { loadMetroTrend } = await import('../lib/data')
    vi.mocked(loadMetroTrend).mockClear()
    const noTrendMeta = {
      ...meta,
      metros: meta.metros.map(({ trendYears: _drop, ...rest }) => rest),
    }
    render(<MetroPanel meta={noTrendMeta} salaries={salaries} cbsa="12420" soc="15-1252" adjusted={false} national={national} onClose={() => {}} />)
    expect(screen.queryByText(/pay over time/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no published history/i)).not.toBeInTheDocument()
    expect(loadMetroTrend).not.toHaveBeenCalled()
  })

  it('toggling cost-of-living leaves the trend values untouched', async () => {
    // The RPP guard at the integration level: `adjusted` must not reach the trend. RPP is
    // renormalised to US=100 every year, so letting it deflate a time series would produce an
    // artifact that still looks like a chart.
    const { container, rerender } = render(
      <MetroPanel meta={meta} salaries={salaries} cbsa="12420" soc="15-1252" adjusted={false} national={national} onClose={() => {}} />)
    await waitFor(() => expect(container.querySelector('[data-metro-series]')).toBeInTheDocument())
    const before = [...container.querySelectorAll('[data-metro-series]')].map(n => n.getAttribute('points'))
    expect(before.length).toBeGreaterThan(0)

    rerender(<MetroPanel meta={meta} salaries={salaries} cbsa="12420" soc="15-1252" adjusted={true} national={national} onClose={() => {}} />)
    const after = [...container.querySelectorAll('[data-metro-series]')].map(n => n.getAttribute('points'))
    expect(after).toEqual(before)
  })
})
