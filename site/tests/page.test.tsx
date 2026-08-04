import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Page from '../app/page'

const meta = {
  year: 2025, generated: '2026-08-03T00:00:00Z', topCodeValue: 239200, rppYear: 2024,
  lcaPeriod: 'FY2025 Q1–Q4', sources: { oews: 'x', lca: [], hud: 'x', zipMatchRate: 0.99 },
  roles: [{ soc: '15-1252', label: 'Software Developers', short: 'SWE' }],
  metros: [
    { cbsa: '12420', name: 'Austin-Round Rock-San Marcos, TX', state: 'TX', lat: 30, lng: -97, rpp: 98.066, lcaFilings: 13136 },
  ],
}

const salaries = {
  '12420': { '15-1252': { emp: 31960, lq: 2.28, p10: 96110, p25: 104000, p50: 134120, p75: 168730, p90: 209890 } },
}

const titles = { lcaPeriod: 'FY2025 Q1–Q4', families: [] }

describe('Page', () => {
  it('unknown role/metro in the URL fall back to defaults instead of a dead panel', async () => {
    window.history.replaceState(null, '', '/?role=15-9999&metro=99999')
    // jsdom does not implement matchMedia.
    window.matchMedia = window.matchMedia ?? ((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList)
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve({
      ok: true,
      json: async () => (path.includes('salaries') ? salaries : path.includes('titles') ? titles : meta),
    })))

    render(<Page />)

    await waitFor(() => expect(screen.getByText(/Software Developers pay across/)).toBeInTheDocument())
    expect(document.querySelector('.metro-panel')).toBeNull()
  })
})
