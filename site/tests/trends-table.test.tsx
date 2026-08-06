import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TrendsTable } from '../components/TrendsTable'
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
  },
  skippedRoles: [],
  breaks: [{ year: 2021, note: 'split' }],
}

// Finds the tbody <tr> whose visible text mentions a given year, regardless of exactly how the
// component marks up that cell (e.g. a base-year tag sharing the same header cell as the year).
// Scoped to tbody: the "{base} dollars" column header (e.g. "2022 dollars") can itself contain
// the base year's digits, which would otherwise collide with a getAllByRole('row') search.
function rowFor(year: number): HTMLElement {
  const tbody = screen.getByRole('table').querySelector('tbody')
  const row = [...(tbody?.querySelectorAll('tr') ?? [])].find(r => r.textContent?.includes(String(year)))
  if (!row) throw new Error(`no row found for year ${year}`)
  return row as HTMLElement
}

describe('TrendsTable', () => {
  it('renders one row per year, plus the header row', () => {
    render(<TrendsTable trends={fixture} selected="15-1252" />)
    expect(screen.getAllByRole('row')).toHaveLength(fixture.years.length + 1)
  })

  it('explains years with no separate BLS code instead of leaving them blank', () => {
    render(<TrendsTable trends={fixture} selected="15-1252" />)
    // 2019 and 2020 are null for 15-1252 in this fixture.
    expect(screen.getAllByText('no separate BLS code')).toHaveLength(2)
  })

  it('shows nominal and real as separate values in a non-base year', () => {
    render(<TrendsTable trends={fixture} selected="15-1252" />)
    const cells = within(rowFor(2021)).getAllByRole('cell')
    expect(cells.map(c => c.textContent)).toEqual(['$100', '$120'])
  })

  it('shows nominal and real as equal values in the base year', () => {
    render(<TrendsTable trends={fixture} selected="15-1252" />)
    const cells = within(rowFor(2022)).getAllByRole('cell')
    expect(cells.map(c => c.textContent)).toEqual(['$110', '$110'])
  })

  it('marks the base year row so the identical columns are explained', () => {
    render(<TrendsTable trends={fixture} selected="15-1252" />)
    expect(rowFor(2022).textContent).toMatch(/base year/i)
    expect(rowFor(2021).textContent).not.toMatch(/base year/i)
  })

  it('formats money with thousands separators and no decimals', () => {
    const bigMoney: TrendsJson = {
      ...fixture,
      roles: {
        '15-1252': { ...fixture.roles['15-1252'], nominal: [null, null, 100, 135980], real: [null, null, 120, 135980] },
      },
    }
    render(<TrendsTable trends={bigMoney} selected="15-1252" />)
    expect(screen.getAllByText('$135,980')).toHaveLength(2)
  })

  it('uses a real table with scoped column headers for screen readers', () => {
    render(<TrendsTable trends={fixture} selected="15-1252" />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    const yearHeader = screen.getByRole('columnheader', { name: /year/i })
    const nominalHeader = screen.getByRole('columnheader', { name: /nominal/i })
    expect(yearHeader.getAttribute('scope')).toBe('col')
    expect(nominalHeader.getAttribute('scope')).toBe('col')
  })

  it('renders nothing for an unknown role rather than throwing', () => {
    const { container } = render(<TrendsTable trends={fixture} selected="99-9999" />)
    expect(container.querySelector('table')).toBeNull()
  })
})
