import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MetroPanel } from '../components/MetroPanel'
import type { Meta } from '../lib/types'

const meta = {
  year: 2025, generated: '2026-08-03T00:00:00Z', topCodeValue: 239200, rppYear: 2024,
  lcaPeriod: 'FY2025 Q1–Q4', sources: { oews: 'x', lca: [], hud: 'x', zipMatchRate: 0.99 },
  roles: [{ soc: '15-1252', label: 'Software Developers', short: 'SWE' }],
  metros: [
    { cbsa: '12420', name: 'Austin-Round Rock-San Marcos, TX', state: 'TX', lat: 30, lng: -97, rpp: 98.066, lcaFilings: 13136 },
    { cbsa: '99991', name: 'Nowhere, ZZ', state: 'ZZ', lat: 40, lng: -100, rpp: null, lcaFilings: 0 },
  ],
} satisfies Meta

const salaries = {
  '12420': { '15-1252': { emp: 31960, lq: 2.28, p10: 96110, p25: 104000, p50: 134120, p75: 168730, p90: 209890 } },
  '99991': { '15-1252': { emp: 100, lq: 0.5, p10: null, p25: null, p50: null, p75: null, p90: null } },
}

describe('MetroPanel', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('shows headline stats and fetches employers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cbsa: '12420', roles: { '15-1252': { employers: [{ name: 'Amazon.com Services LLC', filings: 583, median: 152100 }], sample: [1, 2], n: 600, p99: 250000 } } }),
    }))
    render(<MetroPanel meta={meta} salaries={salaries} cbsa="12420" soc="15-1252" adjusted={false} onClose={() => {}} />)
    expect(screen.getByText(/Austin-Round Rock/)).toBeInTheDocument()
    expect(screen.getAllByText('$134,120').length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.getByText(/Amazon\.com Services LLC/)).toBeInTheDocument())
    expect(screen.getByText(/583 filings/)).toBeInTheDocument()
  })

  it('lcaFilings 0 -> renders no-filings note and never fetches', () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    render(<MetroPanel meta={meta} salaries={salaries} cbsa="99991" soc="15-1252" adjusted={false} onClose={() => {}} />)
    expect(screen.getByText(/No H-1B filings on record/)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('adjusted mode with null rpp -> explains instead of numbers', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<MetroPanel meta={meta} salaries={salaries} cbsa="99991" soc="15-1252" adjusted={true} onClose={() => {}} />)
    expect(screen.getByText(/no cost-of-living index/i)).toBeInTheDocument()
  })
})
