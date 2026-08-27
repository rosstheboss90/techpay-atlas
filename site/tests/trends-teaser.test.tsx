import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrendsTeaser } from '../components/TrendsTeaser'
import type { TrendsJson } from '../lib/trends-types'

const trends: TrendsJson = {
  years: [2021, 2025], headlineFrom: 2021, headlineTo: 2025,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2025 },
  roles: { '15-1252': { label: 'Software Developers', short: 'SWE', firstYear: 2021,
    nominal: [120730, 135980], real: [144100, 135980], emp: [null, null],
    cappedP90: [false, false], changeReal: -0.056823 } },
  skippedRoles: [], breaks: [],
}

describe('TrendsTeaser', () => {
  it('states the real change and links to /trends carrying the role', () => {
    render(<TrendsTeaser trends={trends} soc="15-1252" roleLabel="Software Developers" />)
    expect(screen.getByRole('heading', { name: 'Are wages beating inflation?' })).toHaveAttribute('id', 'trend-h')
    // The fact sentence begins with the role label — asserting the full sentence (not just the
    // percentage) pins that the component no longer prepends its own "{roleLabel}: " prefix,
    // which would otherwise duplicate the subject.
    expect(screen.getByText(/^Software Developers are down 5\.7% in real terms since 2021\./)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/trends?role=15-1252')
  })

  it('renders the section with a fallback line (and no link) when trends failed to load', () => {
    render(<TrendsTeaser trends={null} soc="15-1252" roleLabel="Software Developers" />)
    expect(screen.getByText(/Trend data unavailable/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders the real-terms sparkline above the sentence when narrow', () => {
    const trends = {
      years: [2019, 2020, 2021, 2022, 2023, 2024, 2025], headlineFrom: 2021,
      roles: { S: { changeReal: -0.057, real: [100, 102, 101, 99, 97, 96, 94], nominal: [] } },
    } as never
    const { container } = render(<TrendsTeaser trends={trends} soc="S" roleLabel="Software Developers" />)
    expect(container.querySelector('.mini-spark')).not.toBeNull()
  })

  it('omits the sparkline when the series has fewer than two real points, even when narrow', () => {
    const trends = {
      years: [2019, 2020], headlineFrom: 2019,
      roles: { S: { changeReal: 0, real: [null, 100], nominal: [] } },
    } as never
    const { container } = render(<TrendsTeaser trends={trends} soc="S" roleLabel="Software Developers" />)
    expect(container.querySelector('.mini-spark')).toBeNull()
    expect(container.textContent).toContain('Software Developers')
  })

  it('omits the sparkline entirely when trends failed to load', () => {
    const { container } = render(<TrendsTeaser trends={null} soc="S" roleLabel="Software Developers" />)
    expect(container.querySelector('.mini-spark')).toBeNull()
    expect(container.textContent).toContain('Trend data unavailable.')
  })

  it('renders the sparkline with no viewport prop — it is not a phone-only idea', () => {
    // Was previously pinned the other way: the sparkline used to be gated narrow-only, purely
    // to hold the "desktop must not change" constraint of the branch that added it. Measured on
    // the deployed desktop page, this section was 50px tall against neighbours of 660-911px —
    // the only section carrying no data ink. The gate is gone; the viewports differ in CSS only.
    const trends = {
      years: [2019, 2020, 2021, 2022, 2023, 2024, 2025], headlineFrom: 2021,
      roles: { S: { changeReal: -0.057, real: [100, 102, 101, 99, 97, 96, 94], nominal: [] } },
    } as never
    const { container } = render(<TrendsTeaser trends={trends} soc="S" roleLabel="Software Developers" />)
    expect(container.querySelector('.mini-spark')).not.toBeNull()
    expect(container.textContent).toContain('Software Developers are down 5.7% in real terms since 2021.')
  })
})
