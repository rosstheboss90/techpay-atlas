import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Page from '../app/page'
import { __clearDataCache } from '../lib/data'

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

const trends = {
  years: [2021, 2025], headlineFrom: 2021, headlineTo: 2025,
  deflator: { series: 'CPI-U', period: 'annual', base: 2025 },
  roles: {
    '15-1252': {
      label: 'Software Developers', short: 'SWE', firstYear: 2021,
      nominal: [120000, 134120], real: [125000, 134120], emp: [30000, 31960],
      cappedP90: [false, false], changeReal: 0.073,
    },
  },
  skippedRoles: [], breaks: [],
}

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
      json: async () => (path.includes('salaries') ? salaries : path.includes('titles') ? titles
        : path.includes('trends') ? trends : meta),
    })))

    render(<Page />)

    await waitFor(() => expect(screen.getByText(/Software Developers pay across/)).toBeInTheDocument())
    expect(document.querySelector('.metro-panel')).toBeNull()
  })

  it('renders the masthead when trends.json fails to load, even though meta and salaries succeed', async () => {
    // Task 7: trends is additive context (MetroTrend ghost line + /trends teaser) fetched
    // best-effort in Promise.all — a rejected trends.json must not blank the whole page.
    window.history.replaceState(null, '', '/')
    window.matchMedia = window.matchMedia ?? ((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList)
    // The data.ts loaders memoize per URL across the module's lifetime, so a prior test's
    // successful trends.json fetch would otherwise mask this one's rejection.
    __clearDataCache()
    vi.stubGlobal('fetch', vi.fn((path: string) => path.includes('trends')
      ? Promise.reject(new Error('trends.json unavailable'))
      : Promise.resolve({
          ok: true,
          json: async () => (path.includes('salaries') ? salaries : path.includes('titles') ? titles : meta),
        })))

    render(<Page />)

    await waitFor(() => expect(screen.getByText(/Software Developers pay across/)).toBeInTheDocument())
  })

  // Scope note: scrollIntoView is stubbed on the prototype here to assert TARGETING (the effect
  // finds #h2h-h and calls it). The stub means this test cannot protect the `?.scrollIntoView?.()`
  // guard at page.tsx's hash effect — jsdom has no native method to fall through to. That guard
  // was verified separately: an unstubbed render throws pre-fix, clean post-fix.
  it('desktop hash deep-link scrolls to the target section after load', async () => {
    window.history.replaceState(null, '', '/#h2h-h')
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    })))
    __clearDataCache()
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve({
      ok: true,
      json: async () => (path.includes('salaries') ? salaries : path.includes('titles') ? titles
        : path.includes('trends') ? trends : meta),
    })))
    const originalScrollIntoView = Element.prototype.scrollIntoView
    const spy = vi.fn()
    Element.prototype.scrollIntoView = spy

    try {
      render(<Page />)
      await screen.findByText(/TechPay Atlas/)
      await waitFor(() => expect(spy).toHaveBeenCalled())
    } finally {
      window.history.replaceState(null, '', '/')
      Element.prototype.scrollIntoView = originalScrollIntoView
      vi.unstubAllGlobals()
    }
  })
})
