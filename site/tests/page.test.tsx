import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

    await waitFor(() => expect(screen.getByText(/Software Developers · 1 metros · BLS OEWS 2025/)).toBeInTheDocument())
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

    await waitFor(() => expect(screen.getByText(/Software Developers · 1 metros · BLS OEWS 2025/)).toBeInTheDocument())
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

  // Regression pin: page.tsx assembles seven QuestionSection call sites by hand (question/fact
  // per section) — nothing structurally stops a prop from landing on the wrong call site (e.g.
  // the h2h-h card's `question` was dropped and every prop below it shifted a slot). Narrow mode
  // renders each section's eyebrow as `.qsec-q`, so pin all seven texts, in order, against the
  // seven section questions the rest of the site (Task 6 headings, e2e) also pins.
  it('narrow: all seven question-index cards carry their own question, not a neighbor\'s', async () => {
    window.history.replaceState(null, '', '/')
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    })))
    __clearDataCache()
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve({
      ok: true,
      json: async () => (path.includes('salaries') ? salaries : path.includes('titles') ? titles
        : path.includes('trends') ? trends : meta),
    })))

    try {
      render(<Page />)
      await screen.findByText(/TechPay Atlas/)
      await waitFor(() => expect(document.querySelectorAll('.qsec-q').length).toBe(7))
      const questions = [...document.querySelectorAll('.qsec-q')].map(n => n.textContent)
      expect(questions).toEqual([
        'Where does it pay the most?',
        'Are you underpaid?',
        'Does your salary go far there?',
        'Are wages beating inflation?',
        "What's this job really called?",
        'What else could you be?',
        'How does it all compare?',
      ])
    } finally {
      window.history.replaceState(null, '', '/')
      vi.unstubAllGlobals()
    }
  })

  // Regression pin: QuestionSection itself never owns a DOM id — six of the seven anchors
  // (h2h-h, slope-h, trend-h, tl-h, rsim-h, hm-heading) live on the child's own heading, and the
  // seventh (sec-map) lives on a div page.tsx renders directly. Nothing structurally stops either
  // side from also claiming an id: a section wrapper re-adding `id={anchorId}` would duplicate
  // whichever child already carries it (six sections did, the moment narrow always mounts
  // children), and dropping `id="sec-map"` from page.tsx's own div would leave the map section
  // with NO anchor on desktop, since QuestionSection renders no wrapper there at all. This test
  // covers both failure directions directly, on narrow, where the duplication was invisible to
  // an isolated component test (whose stand-in child carries no id of its own).
  it('narrow: every section anchor id resolves to exactly one element in the DOM', async () => {
    window.history.replaceState(null, '', '/')
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    })))
    __clearDataCache()
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve({
      ok: true,
      json: async () => (path.includes('salaries') ? salaries : path.includes('titles') ? titles
        : path.includes('trends') ? trends : meta),
    })))

    try {
      render(<Page />)
      await screen.findByText(/TechPay Atlas/)
      await waitFor(() => expect(document.querySelectorAll('.qsec-q').length).toBe(7))
      const anchorIds = ['sec-map', 'h2h-h', 'slope-h', 'trend-h', 'tl-h', 'rsim-h', 'hm-heading']
      for (const id of anchorIds) {
        expect(document.querySelectorAll('#' + id).length).toBe(1)
      }
    } finally {
      window.history.replaceState(null, '', '/')
      vi.unstubAllGlobals()
    }
  })

  it('narrow: masthead keeps only the h1 and value line; thesis and links move to the footer', async () => {
    window.history.replaceState(null, '', '/')
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    })))
    __clearDataCache()
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve({
      ok: true,
      json: async () => (path.includes('salaries') ? salaries : path.includes('titles') ? titles
        : path.includes('trends') ? trends : meta),
    })))

    try {
      render(<Page />)
      await screen.findByText(/TechPay Atlas/)
      await waitFor(() => expect(document.querySelectorAll('.qsec-q').length).toBe(7))

      const masthead = document.querySelector('.masthead')!
      expect(masthead.querySelector('h1')).not.toBeNull()
      expect(masthead.querySelector('.value')).not.toBeNull()
      expect(masthead.querySelector('.thesis')).toBeNull()
      expect(masthead.querySelector('.masthead-link')).toBeNull()
      // Desktop-only content must not leak into the narrow masthead.
      expect(masthead.querySelector('.tagline-small')).toBeNull()

      const footer = document.querySelector('footer.provenance')!
      expect(footer.querySelector('.thesis')).not.toBeNull()
      expect(footer.querySelectorAll('.masthead-link')).toHaveLength(3)
    } finally {
      window.history.replaceState(null, '', '/')
      vi.unstubAllGlobals()
    }
  })

  it('narrow: hero shows the top metro as a big number and the map is not interactive', async () => {
    window.history.replaceState(null, '', '/')
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    })))
    __clearDataCache()
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve({
      ok: true,
      json: async () => (path.includes('salaries') ? salaries : path.includes('titles') ? titles
        : path.includes('trends') ? trends : meta),
    })))

    try {
      render(<Page />)
      await screen.findByText(/TechPay Atlas/)
      await waitFor(() => expect(document.querySelectorAll('.qsec-q').length).toBe(7))
      expect(document.querySelector('.hero-num')!.textContent).toMatch(/^\$[\d,]+$/)
      expect(document.querySelector('.hero-place')).not.toBeNull()
      const map = document.querySelector('.salary-map')!
      expect(map).toHaveAttribute('aria-hidden', 'true')
      expect(map.querySelector('circle[tabindex]')).toBeNull()
      expect(map.querySelector('circle[role="button"]')).toBeNull()
      expect(map.querySelector('circle[aria-label]')).toBeNull()

      // The behavioural half: clicking a bubble must not select a metro.
      const bubble = map.querySelector('circle')!
      fireEvent.click(bubble)
      expect(document.querySelector('.metro-panel')).toBeNull()
    } finally {
      window.history.replaceState(null, '', '/')
      vi.unstubAllGlobals()
    }
  })

  it('desktop: the map stays interactive — bubbles are focusable and labelled', async () => {
    window.history.replaceState(null, '', '/')
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

    try {
      render(<Page />)
      await screen.findByText(/TechPay Atlas/)
      await waitFor(() => expect(document.querySelector('.salary-map')).not.toBeNull())
      const map = document.querySelector('.salary-map')!
      expect(map).not.toHaveAttribute('aria-hidden')
      expect(map).toHaveAttribute('role', 'group')
      expect(map.querySelectorAll('circle[tabindex]').length).toBeGreaterThan(0)
      expect(map.querySelector('circle[role="button"]')).not.toBeNull()
    } finally {
      window.history.replaceState(null, '', '/')
      vi.unstubAllGlobals()
    }
  })

  it('narrow: the explorer opens from the hero and is not mounted before that', async () => {
    window.history.replaceState(null, '', '/')
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    })))
    __clearDataCache()
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve({
      ok: true,
      json: async () => (path.includes('salaries') ? salaries : path.includes('titles') ? titles
        : path.includes('trends') ? trends : meta),
    })))

    try {
      render(<Page />)
      await screen.findByText(/TechPay Atlas/)
      await waitFor(() => expect(document.querySelectorAll('.qsec-q').length).toBe(7))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /explore the map/i }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    } finally {
      window.history.replaceState(null, '', '/')
      vi.unstubAllGlobals()
    }
  })

  it('narrow: hero omits the number entirely when no metro has a median for the role', async () => {
    // Spec error-handling row: never a blank or NaN slot — the map and the fallback
    // sentence stand alone.
    window.history.replaceState(null, '', '/')
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    })))
    __clearDataCache()
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve({
      ok: true,
      json: async () => (path.includes('salaries') ? {} : path.includes('titles') ? titles
        : path.includes('trends') ? trends : meta),
    })))

    try {
      render(<Page />)
      await screen.findByText(/TechPay Atlas/)
      await waitFor(() => expect(document.querySelectorAll('.qsec-q').length).toBe(7))
      expect(document.querySelector('.hero-num')).toBeNull()
      expect(document.querySelector('.qsec-deck')!.textContent)
        .toBe('Percentiles for every metro on the map.')
    } finally {
      window.history.replaceState(null, '', '/')
      vi.unstubAllGlobals()
    }
  })

  it('narrow: the full-ranking overlay opens from the slope section and is not mounted before that', async () => {
    window.history.replaceState(null, '', '/')
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    })))
    __clearDataCache()
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve({
      ok: true,
      json: async () => (path.includes('salaries') ? salaries : path.includes('titles') ? titles
        : path.includes('trends') ? trends : meta),
    })))

    try {
      render(<Page />)
      await screen.findByText(/TechPay Atlas/)
      await waitFor(() => expect(document.querySelectorAll('.qsec-q').length).toBe(7))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /see the full ranking/i }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    } finally {
      window.history.replaceState(null, '', '/')
      vi.unstubAllGlobals()
    }
  })

  it('desktop: no full-ranking button — the overlay is a narrow-only affordance', async () => {
    window.history.replaceState(null, '', '/')
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

    try {
      render(<Page />)
      await screen.findByText(/TechPay Atlas/)
      await waitFor(() => expect(document.querySelector('.slope')).not.toBeNull())
      expect(screen.queryByRole('button', { name: /see the full ranking/i })).not.toBeInTheDocument()
    } finally {
      window.history.replaceState(null, '', '/')
      vi.unstubAllGlobals()
    }
  })
})
