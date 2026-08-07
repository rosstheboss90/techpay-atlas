import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TrendsPath } from '../components/TrendsPath'
import type { TrendsJson } from '../lib/trends-types'

const fixture: TrendsJson = {
  years: [2019, 2020, 2021, 2022],
  headlineFrom: 2021,
  headlineTo: 2022,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2022 },
  roles: {
    '15-1252': { label: 'Software Developers', short: 'SWE', firstYear: 2021,
      nominal: [null, null, 100, 110], real: [null, null, 120, 110], emp: [null, null, 5, 6],
      cappedP90: [false, false, false, false], changeReal: -0.0833 },
    '11-3021': { label: 'IT Managers', short: 'IT Mgr', firstYear: 2019,
      nominal: [80, 85, 90, 100], real: [95, 98, 105, 100], emp: [1, 2, 3, 4],
      cappedP90: [true, true, false, false], changeReal: 0.25 },
  },
  skippedRoles: [],
  breaks: [{ year: 2021, note: 'BLS split combined codes in May 2021.' }],
}

describe('TrendsPath', () => {
  it('draws a line per role', () => {
    const { container } = render(<TrendsPath trends={fixture} selected="15-1252" />)
    expect(container.querySelectorAll('[data-series]')).toHaveLength(2)
  })

  it('marks the selected series so the others can be ghosted', () => {
    const { container } = render(<TrendsPath trends={fixture} selected="15-1252" />)
    expect(container.querySelector('[data-series="15-1252"]')?.getAttribute('data-highlighted')).toBe('true')
    expect(container.querySelector('[data-series="11-3021"]')?.getAttribute('data-highlighted')).toBe('false')
  })

  it('starts a ragged series at its own first year, not at the axis origin', () => {
    const { container } = render(<TrendsPath trends={fixture} selected="15-1252" />)
    // 15-1252 begins in 2021 (index 2 of 4), so its first x must be well right of the axis start
    const pts = container.querySelector('[data-series="15-1252"]')?.getAttribute('points') ?? ''
    const firstX = Number(pts.trim().split(/[\s,]+/)[0])
    const full = container.querySelector('[data-series="11-3021"]')?.getAttribute('points') ?? ''
    const fullFirstX = Number(full.trim().split(/[\s,]+/)[0])
    expect(firstX).toBeGreaterThan(fullFirstX)
  })

  it('gives the ragged series fewer points than the full one', () => {
    const { container } = render(<TrendsPath trends={fixture} selected="15-1252" />)
    const count = (soc: string) =>
      (container.querySelector(`[data-series="${soc}"]`)?.getAttribute('points') ?? '').trim().split(/\s+/).length
    expect(count('15-1252')).toBe(2)
    expect(count('11-3021')).toBe(4)
  })

  it('renders a break marker for each recorded break', () => {
    const { container } = render(<TrendsPath trends={fixture} selected="15-1252" />)
    expect(container.querySelectorAll('[data-break]')).toHaveLength(1)
  })

  it('explains the ragged start rather than leaving it unexplained', () => {
    render(<TrendsPath trends={fixture} selected="15-1252" />)
    expect(screen.getByText(/split combined codes/i)).toBeInTheDocument()
  })

  it('names the selected role in the caption', () => {
    render(<TrendsPath trends={fixture} selected="15-1252" />)
    expect(screen.getByText(/Software Developers/)).toBeInTheDocument()
  })

  it('paints the selected series last so it sits above the ghosted ones', () => {
    const { container } = render(<TrendsPath trends={fixture} selected="11-3021" />)
    const order = [...container.querySelectorAll('[data-series]')].map(n => n.getAttribute('data-series'))
    expect(order[order.length - 1]).toBe('11-3021')
  })

  it('plots different y-coordinates in nominal mode than in real mode for the same role', () => {
    // 11-3021 real is [95, 98, 105, 100], nominal is [80, 85, 90, 100] — different values, and
    // the two modes also use different y-domains (valueDomain per mode), so both the point
    // values and the domain they're mapped against change.
    const real = render(<TrendsPath trends={fixture} selected="11-3021" mode="real" />)
    const nominal = render(<TrendsPath trends={fixture} selected="11-3021" mode="nominal" />)
    const realPoints = real.container.querySelector('[data-series="11-3021"]')?.getAttribute('points')
    const nominalPoints = nominal.container.querySelector('[data-series="11-3021"]')?.getAttribute('points')
    expect(realPoints).toBeTruthy()
    expect(nominalPoints).toBeTruthy()
    expect(nominalPoints).not.toBe(realPoints)
  })

  it('defaults to real mode when no mode prop is given', () => {
    const withDefault = render(<TrendsPath trends={fixture} selected="11-3021" />)
    const withExplicitReal = render(<TrendsPath trends={fixture} selected="11-3021" mode="real" />)
    const a = withDefault.container.querySelector('[data-series="11-3021"]')?.getAttribute('points')
    const b = withExplicitReal.container.querySelector('[data-series="11-3021"]')?.getAttribute('points')
    expect(a).toBe(b)
  })

  it('states the figures are restated in base-year dollars in real mode', () => {
    render(<TrendsPath trends={fixture} selected="15-1252" mode="real" />)
    expect(screen.getByText(/restated using cpi-u/i)).toBeInTheDocument()
  })

  it('does not claim inflation adjustment in nominal mode', () => {
    render(<TrendsPath trends={fixture} selected="15-1252" mode="nominal" />)
    // The nominal caption must not imply the figures are comparable across years.
    // so assert against the real-mode-only affirmative phrasing rather than that substring.
    expect(screen.queryByText(/restated using cpi-u/i)).not.toBeInTheDocument()
    expect(screen.getByText(/not comparable/i)).toBeInTheDocument()
  })

  it('labels the nominal svg distinctly so assistive tech doesn\'t hear "real" for as-paid figures', () => {
    render(<TrendsPath trends={fixture} selected="15-1252" mode="nominal" />)
    expect(screen.getByRole('img', { name: /nominal median pay over time/i })).toBeInTheDocument()
  })
})
