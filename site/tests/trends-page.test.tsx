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
})
