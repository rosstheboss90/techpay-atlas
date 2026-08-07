import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrendsRanked } from '../components/TrendsRanked'
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
  breaks: [],
}

describe('TrendsRanked', () => {
  it('renders one bar row per role', () => {
    render(<TrendsRanked trends={fixture} selected="15-1252" onSelect={() => {}} />)
    expect(screen.getByText('Software Developers')).toBeInTheDocument()
    expect(screen.getByText('IT Managers')).toBeInTheDocument()
  })

  it('orders gains above losses', () => {
    const { container } = render(<TrendsRanked trends={fixture} selected="15-1252" onSelect={() => {}} />)
    const labels = [...container.querySelectorAll('[data-role-label]')].map(n => n.textContent)
    expect(labels).toEqual(['IT Managers', 'Software Developers'])
  })

  it('shows the change as a signed percentage', () => {
    render(<TrendsRanked trends={fixture} selected="15-1252" onSelect={() => {}} />)
    expect(screen.getByText('+25.0%')).toBeInTheDocument()
    expect(screen.getByText('−8.3%')).toBeInTheDocument()
  })

  it('marks the selected role', () => {
    const { container } = render(<TrendsRanked trends={fixture} selected="11-3021" onSelect={() => {}} />)
    expect(container.querySelector('[data-selected="true"]')?.textContent).toContain('IT Managers')
  })

  it('calls onSelect with the SOC when a row is activated', () => {
    const onSelect = vi.fn()
    render(<TrendsRanked trends={fixture} selected="15-1252" onSelect={onSelect} />)
    screen.getByText('IT Managers').click()
    expect(onSelect).toHaveBeenCalledWith('11-3021')
  })

  it('is keyboard reachable — each row is a focusable control', () => {
    const { container } = render(<TrendsRanked trends={fixture} selected="15-1252" onSelect={() => {}} />)
    const rows = container.querySelectorAll('[data-role-row]')
    expect(rows).toHaveLength(2)
    rows.forEach(r => expect(r.getAttribute('tabindex')).toBe('0'))
  })

  it('states the window and the deflator so the number is not free-floating', () => {
    render(<TrendsRanked trends={fixture} selected="15-1252" onSelect={() => {}} />)
    expect(screen.getByText(/2021.*2022/)).toBeInTheDocument()
    expect(screen.getByText(/CPI-U/)).toBeInTheDocument()
  })
})
