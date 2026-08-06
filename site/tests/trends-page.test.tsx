import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrendsJson } from '../lib/trends-types'

const fixture: TrendsJson = {
  years: [2021, 2022],
  headlineFrom: 2021,
  headlineTo: 2022,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2022 },
  roles: {
    '15-1252': { label: 'Software Developers', short: 'SWE', firstYear: 2021,
      nominal: [100, 110], real: [120, 110], emp: [5, 6], cappedP90: [false, false], changeReal: -0.0833 },
    '11-3021': { label: 'IT Managers', short: 'IT Mgr', firstYear: 2021,
      nominal: [90, 100], real: [80, 100], emp: [3, 4], cappedP90: [false, false], changeReal: 0.25 },
  },
  skippedRoles: [],
  breaks: [{ year: 2021, note: 'BLS split combined codes in May 2021.' }],
}

vi.mock('../lib/data', () => ({ loadTrends: vi.fn(async () => fixture) }))

beforeEach(() => {
  window.history.replaceState(null, '', '/trends')
  vi.clearAllMocks()
})

describe('/trends page', () => {
  it('renders both figures once data loads', async () => {
    const Page = (await import('../app/trends/page')).default
    render(<Page />)
    // Scoped to the ranked figure's row label: the default-selected role's label also
    // appears a second time, bolded in TrendsPath's caption (both components predate this
    // page and are tested on their own), so an unscoped getByText is ambiguous here.
    await waitFor(() => expect(screen.getByText('Software Developers', { selector: '.tr-label' })).toBeInTheDocument())
    expect(screen.getByRole('img', { name: /real median pay over time/i })).toBeInTheDocument()
  })

  it('states the hot-baseline caveat rather than burying it', async () => {
    const Page = (await import('../app/trends/page')).default
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/unusually (strong|hot)/i)).toBeInTheDocument())
  })

  it('warns that occupation mix can move a median without anyone getting a raise', async () => {
    const Page = (await import('../app/trends/page')).default
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/mix inside an occupation/i)).toBeInTheDocument())
  })

  it('explains that a new code is not a new job', async () => {
    const Page = (await import('../app/trends/page')).default
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/started counting it separately/i)).toBeInTheDocument())
  })

  it('names the deflator', async () => {
    const Page = (await import('../app/trends/page')).default
    render(<Page />)
    // Scoped to the "How to read this" method section: both figure captions also name
    // CPI-U on their own (pre-existing, tested elsewhere), so an unscoped match is ambiguous.
    await waitFor(() => expect(screen.getByText(/CPI-U/, { selector: '.t-method p' })).toBeTruthy())
  })

  it('honours a role from the query string', async () => {
    window.history.replaceState(null, '', '/trends?role=11-3021')
    const Page = (await import('../app/trends/page')).default
    const { container } = render(<Page />)
    await waitFor(() =>
      expect(container.querySelector('[data-series="11-3021"]')?.getAttribute('data-highlighted')).toBe('true'))
  })

  it('falls back to a real role when the query string names one that is absent', async () => {
    window.history.replaceState(null, '', '/trends?role=99-9999')
    const Page = (await import('../app/trends/page')).default
    const { container } = render(<Page />)
    await waitFor(() => expect(container.querySelectorAll('[data-series]').length).toBe(2))
    const highlighted = [...container.querySelectorAll('[data-series]')]
      .filter(n => n.getAttribute('data-highlighted') === 'true')
    expect(highlighted).toHaveLength(1)
  })

  it('shows an error message when the data fails to load', async () => {
    const { loadTrends } = await import('../lib/data')
    vi.mocked(loadTrends).mockRejectedValueOnce(new Error('boom'))
    const Page = (await import('../app/trends/page')).default
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/boom/)).toBeInTheDocument())
  })

  it('leads with the latest nominal median and its year for the selected role', async () => {
    const Page = (await import('../app/trends/page')).default
    const { container } = render(<Page />)
    // Default-selected role is 15-1252 (fixture nominal [100, 110], years [2021, 2022]) —
    // the latest reported nominal figure is $110 in 2022, not the deflated $110/$120 pair.
    // Scoped to .t-lead: the table below also shows $110 in its base-year row, coincidentally
    // equal to the lead figure in this small fixture.
    await waitFor(() => expect(container.querySelector('.t-lead')).toBeTruthy())
    const lead = container.querySelector('.t-lead')
    expect(lead?.textContent).toMatch(/\$110/)
    expect(lead?.textContent).toMatch(/2022/)
  })

  it('renders a nominal/real toggle that changes what the path chart plots', async () => {
    const Page = (await import('../app/trends/page')).default
    const { container } = render(<Page />)
    await waitFor(() => expect(container.querySelector('[data-series="15-1252"]')).toBeInTheDocument())
    const before = container.querySelector('[data-series="15-1252"]')?.getAttribute('points')

    const toggle = screen.getByRole('button', { name: /as-paid/i })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    toggle.click()

    await waitFor(() => expect(toggle.getAttribute('aria-pressed')).toBe('true'))
    await waitFor(() => {
      const after = container.querySelector('[data-series="15-1252"]')?.getAttribute('points')
      expect(after).not.toBe(before)
    })
  })

  it('renders the year-by-year table for the selected role', async () => {
    const Page = (await import('../app/trends/page')).default
    render(<Page />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
  })

  it('keeps the ranked figure describing itself as inflation-adjusted after switching to nominal mode', async () => {
    const Page = (await import('../app/trends/page')).default
    render(<Page />)
    const toggle = await screen.findByRole('button', { name: /as-paid/i })
    toggle.click()
    const rankedCaption = document.querySelector('.tr-ranked .t-caption')
    expect(rankedCaption?.textContent).toMatch(/adjusted for.*inflation/i)
  })
})
