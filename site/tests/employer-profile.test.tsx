import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployerProfile } from '../components/EmployerProfile'
import type { EmployerProfileJson } from '../lib/employer-types'

const profile: EmployerProfileJson = {
  slug: 'amazon', display: 'Amazon', category: 'direct', aliased: true,
  lcaPeriod: 'FY2025 Q1–Q4', totalFilings: 6312,
  entities: [
    { name: 'Amazon.com Services LLC', filings: 3108 },
    { name: 'Amazon Web Services, Inc.', filings: 1744 },
  ],
  roles: {
    '15-1252': {
      national: { filings: 6310, p25: 150000, median: 176000, p75: 200000 },
      metros: [{ cbsa: '42660', filings: 1204, median: 176000 }],
    },
    '15-2051': {
      national: { filings: 2, p25: 149000, median: 149000, p75: 149000 },
      metros: [{ cbsa: '12420', filings: 2, median: 149000 }],
    },
  },
}

const metroNames = { '42660': 'Seattle-Tacoma-Bellevue, WA', '12420': 'Austin-Round Rock, TX' }

/** Matches a <p> by its full text content, tolerating inline markup inside it. getByText's
 *  default matcher works on single text nodes, so wrapping a phrase in <strong> makes it stop
 *  matching — which would otherwise pressure the disclaimer copy to drop its emphasis to suit
 *  the test. These are the honesty disclaimers; the markup serves them, not the other way round. */
const paragraphMatching = (re: RegExp) => (_: string, el: Element | null) =>
  el?.tagName === 'P' && re.test(el.textContent ?? '')

describe('EmployerProfile', () => {
  it('shows the total and both standing disclaimers', () => {
    render(<EmployerProfile profile={profile} metroNames={metroNames} />)
    expect(screen.getByText(/6,312/)).toBeInTheDocument()
    expect(screen.getByText(paragraphMatching(/base-pay floors/i))).toBeInTheDocument()
    expect(screen.getByText(paragraphMatching(/sponsors only/i))).toBeInTheDocument()
  })

  it('keeps the emphasis on the two load-bearing disclaimer phrases', () => {
    const { container } = render(<EmployerProfile profile={profile} metroNames={metroNames} />)
    const emphasised = [...container.querySelectorAll('.t-note strong')].map(e => e.textContent)
    expect(emphasised).toContain('floors')
    expect(emphasised).toContain('sponsors only')
  })

  it('discloses the merged filing entities on demand', async () => {
    render(<EmployerProfile profile={profile} metroNames={metroNames} />)
    await userEvent.click(screen.getByText(/includes 2 filing entities/i))
    expect(screen.getByText('Amazon.com Services LLC')).toBeInTheDocument()
  })

  it('orders roles by filings and resolves metro names', () => {
    render(<EmployerProfile profile={profile} metroNames={metroNames} />)
    const headings = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent ?? '')
    expect(headings[0]).toMatch(/Software Developers/)
    expect(screen.getByText(/Seattle-Tacoma-Bellevue, WA/)).toBeInTheDocument()
  })

  it('marks a thin cell rather than hiding it', () => {
    render(<EmployerProfile profile={profile} metroNames={metroNames} />)
    // 15-2051 has 2 filings nationally and 2 in its only metro
    expect(screen.getAllByText(/thin sample/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Data Scientists/)).toBeInTheDocument()
  })

  it('renders no category chip for an aliased direct employer', () => {
    render(<EmployerProfile profile={profile} metroNames={metroNames} />)
    expect(screen.queryByText(/^staffing/i)).not.toBeInTheDocument()
  })

  it('renders a staffing chip only for an aliased staffing employer', () => {
    const staffing = { ...profile, category: 'staffing' as const, aliased: true }
    render(<EmployerProfile profile={staffing} metroNames={metroNames} />)
    expect(screen.getByText(/staffing/i)).toBeInTheDocument()
  })

  it('renders no chip for an unaliased employer even if its category says staffing', () => {
    const unreviewed = { ...profile, category: 'staffing' as const, aliased: false }
    render(<EmployerProfile profile={unreviewed} metroNames={metroNames} />)
    expect(screen.queryByText(/staffing/i)).not.toBeInTheDocument()
  })
})
