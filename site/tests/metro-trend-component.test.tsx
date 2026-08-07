import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MetroTrend } from '../components/MetroTrend'
import type { MetroTrendData } from '../lib/metro-trend-types'
import type { TrendsJson } from '../lib/trends-types'

const metro: MetroTrendData = {
  cbsa: '12420', name: 'Austin-Round Rock-San Marcos, TX',
  years: [2021, 2022, 2023, 2024, 2025],
  breaks: [{ year: 2024, from: 'Austin-Round Rock, TX', to: 'Austin-Round Rock-San Marcos, TX' }],
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2025 },
  roles: { '15-1252': { nominal: [100, 110, null, 130, 140], real: [120, 118, null, 132, 140], capped: [false, false, false, false, false] } },
}

const national: TrendsJson = {
  years: [2021, 2022, 2023, 2024, 2025],
  headlineFrom: 2021, headlineTo: 2025,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2025 },
  roles: { '15-1252': { label: 'Software Developers', short: 'SWE', firstYear: 2021,
    nominal: [1, 2, 3, 4, 5], real: [10, 11, 12, 13, 14], emp: [1, 1, 1, 1, 1],
    cappedP90: [false, false, false, false, false], changeReal: 0.4 } },
  skippedRoles: [], breaks: [],
}

describe('MetroTrend', () => {
  it('draws one polyline per connectable segment, not one across the gaps', () => {
    // 2023 is suppressed, which alone splits [2021,2022] from what follows. The 2024 delineation
    // break is REDUNDANT with that gap here — segments() (Task 4, already shipped and tested)
    // only inserts an extra split when a break lands inside an already-nonempty run; since the run
    // was just emptied by the 2023 null, there is nothing to sever, so 2024 simply starts the next
    // run and connects forward to 2025. Two segments total, not three: [2021,2022] and [2024,2025].
    // (The plan's draft comment claimed 3 for this fixture; verified against the actual segments()
    // behavior — see site/lib/metro-trend.ts — and corrected here rather than bending the component
    // to manufacture a spurious extra split.)
    const { container } = render(<MetroTrend metro={metro} national={national} soc="15-1252" roleLabel="Software Developers" />)
    expect(container.querySelectorAll('[data-metro-series]')).toHaveLength(2)
  })

  it('draws the national series, labelled so it is not mistaken for a second metro', () => {
    const { container } = render(<MetroTrend metro={metro} national={national} soc="15-1252" roleLabel="Software Developers" />)
    expect(container.querySelector('[data-national-series]')).toBeInTheDocument()
    expect(screen.getByText(/national/i)).toBeInTheDocument()
  })

  it('says the figures are inflation-adjusted, not cost-of-living adjusted', () => {
    render(<MetroTrend metro={metro} national={national} soc="15-1252" roleLabel="Software Developers" />)
    expect(screen.getByText(/not cost.of.living/i)).toBeInTheDocument()
  })

  it('explains a delineation break rather than leaving an unexplained gap', () => {
    render(<MetroTrend metro={metro} national={national} soc="15-1252" roleLabel="Software Developers" />)
    expect(screen.getByText(/boundary changed|redefined/i)).toBeInTheDocument()
  })

  it('says how many years it has when the series is thin', () => {
    const thin: MetroTrendData = { ...metro, roles: { '15-1252': { nominal: [100, null, null, null, null], real: [120, null, null, null, null], capped: [false, false, false, false, false] } } }
    render(<MetroTrend metro={thin} national={national} soc="15-1252" roleLabel="Software Developers" />)
    expect(screen.getByText(/1 year/i)).toBeInTheDocument()
  })

  it('says so plainly when the role was never published in this metro', () => {
    render(<MetroTrend metro={metro} national={national} soc="99-9999" roleLabel="Nonexistent" />)
    expect(screen.getByText(/not published/i)).toBeInTheDocument()
  })

  it('takes no cost-of-living prop — the RPP guard is structural', () => {
    // RPP is renormalised to US=100 annually, so it must never touch a time series. The component
    // cannot receive it, so no future edit can wire it in by accident.
    const src = MetroTrend.toString()
    expect(src).not.toMatch(/\badjusted\b/)
    expect(src).not.toMatch(/\brpp\b/i)
  })
})
