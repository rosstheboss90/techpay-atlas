import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { RoleHeatmap } from '../components/RoleHeatmap'
import { columnDomain, formatColumnRange } from '../lib/heatmap'
import type { Meta, Salaries, SalaryRow } from '../lib/types'

const metro = (cbsa: string, name: string, rpp: number | null = 100) =>
  ({ cbsa, name, state: name.slice(-2), lat: 0, lng: 0, rpp, lcaFilings: 0 })

const meta: Meta = {
  year: 2025, generated: '2026-08-05T00:00:00Z', topCodeValue: 239200, rppYear: 2024,
  lcaPeriod: 'FY2025 Q1–Q4', sources: { oews: '', lca: [], hud: '', zipMatchRate: 0.99 },
  roles: [
    { soc: 'S1', label: 'Role One', short: 'R1' },
    { soc: 'S2', label: 'Role Two', short: 'R2' },
    { soc: 'S3', label: 'Role Three', short: 'R3' },
  ],
  metros: [metro('AAAAA', 'Alpha, AA'), metro('BBBBB', 'Bravo, BB'), metro('CCCCC', 'Cee, CC', null)],
}

const row = (emp: number | null, p50: number | null, lq: number | null = 1, capped = false): SalaryRow =>
  ({ emp, lq, p10: null, p25: null, p50, p75: null, p90: null, ...(capped ? { capped: ['p50'] } : {}) })

const salaries: Salaries = {
  AAAAA: { S1: row(100, 200_000), S2: row(50, 90_000), S3: row(10, 150_000, 1, true) },
  BBBBB: { S1: row(200, 100_000), S2: row(40, 500_000) /* S3 suppressed */ },
  CCCCC: { S1: row(300, 180_000), S2: row(30, 80_000) },
}

const renderHeatmap = (over: Partial<React.ComponentProps<typeof RoleHeatmap>> = {}) => {
  const onSelect = vi.fn()
  render(<RoleHeatmap meta={meta} salaries={salaries} metric="pay" adjusted={false} dark={false}
                      selectedMetro={null} selectedRole="S1" onSelect={onSelect} {...over} />)
  return { onSelect }
}

const rowHeaderOrder = () =>
  screen.getAllByRole('rowheader').map(th => th.textContent)

describe('RoleHeatmap', () => {
  it('renders a semantic table: caption, one col-header per role, one row-header per metro', () => {
    renderHeatmap()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText(/source of truth/i).tagName).toBe('CAPTION')
    for (const short of ['R1', 'R2', 'R3']) expect(screen.getByRole('columnheader', { name: new RegExp(short) })).toBeInTheDocument()
    expect(rowHeaderOrder()).toEqual(['Alpha', 'Cee', 'Bravo']) // default sort: S1 desc (200k, 180k, 100k)
  })

  it('suppressed cell shows an em-dash, is non-interactive, and is excluded from being a button', () => {
    renderHeatmap()
    const empty = screen.getByLabelText('Bravo, BB, Role Three: no data')
    expect(empty.textContent).toBe('—')
    expect(empty.tagName).toBe('TD')
    expect(screen.queryByRole('button', { name: /Bravo, BB, Role Three/ })).toBeNull()
  })

  it('top-coded pay cell carries the ≥ prefix', () => {
    renderHeatmap()
    const capped = screen.getByRole('button', { name: /Alpha, AA, Role Three/ })
    expect(capped.textContent?.startsWith('≥')).toBe(true)
  })

  it('clicking a data cell selects that metro and role', () => {
    const { onSelect } = renderHeatmap()
    fireEvent.click(screen.getByRole('button', { name: /Alpha, AA, Role One: \$200,000/ }))
    expect(onSelect).toHaveBeenCalledWith({ metro: 'AAAAA', role: 'S1' })
  })

  it('clicking a column header re-sorts the rows by that role', () => {
    renderHeatmap()
    expect(rowHeaderOrder()).toEqual(['Alpha', 'Cee', 'Bravo'])
    fireEvent.click(screen.getByRole('button', { name: /Sort by Role Two|R2/ }))
    // S2 desc: Bravo 500k, Alpha 90k, Cee 80k
    expect(rowHeaderOrder()).toEqual(['Bravo', 'Alpha', 'Cee'])
  })

  it('adjusted pay drops an rpp-null metro to an em-dash cell; employment ignores adjust', () => {
    renderHeatmap({ adjusted: true })
    expect(screen.getByLabelText('Cee, CC, Role One: no cost-of-living index').textContent).toBe('—')
    renderHeatmap({ metric: 'emp', adjusted: true })
    expect(screen.getByRole('button', { name: 'Cee, CC, Role One: 300' })).toBeInTheDocument()
  })

  describe('column range labels', () => {
    it('prints each column range from columnDomain — the same source the cell colors use', () => {
      renderHeatmap()
      const expectedS1 = formatColumnRange(columnDomain(meta.metros, salaries, 'S1', 'pay', false), 'pay')
      const expectedS2 = formatColumnRange(columnDomain(meta.metros, salaries, 'S2', 'pay', false), 'pay')
      expect(expectedS1).toBe('$100k–$200k') // sanity against the fixture values below
      expect(expectedS2).toBe('$80k–$500k')
      expect(screen.getByRole('columnheader', { name: /R1/ }).textContent).toContain(expectedS1)
      expect(screen.getByRole('columnheader', { name: /R2/ }).textContent).toContain(expectedS2)
    })

    it('renders different labels for two columns with different domains', () => {
      renderHeatmap()
      const s1 = screen.getByRole('columnheader', { name: /R1/ }).textContent
      const s2 = screen.getByRole('columnheader', { name: /R2/ }).textContent
      expect(s1).not.toBe(s2)
    })

    it('a column with no data anywhere gets an explicit no-data label, not blank or NaN', () => {
      const metaWithEmptyCol: Meta = { ...meta, roles: [...meta.roles, { soc: 'S4', label: 'Role Four', short: 'R4' }] }
      renderHeatmap({ meta: metaWithEmptyCol })
      const s4 = screen.getByRole('columnheader', { name: /R4/ })
      expect(s4.textContent?.toLowerCase()).toContain('no data')
      expect(s4.textContent).not.toContain('NaN')
    })

    it('switching the active metric changes the rendered ranges', () => {
      renderHeatmap({ metric: 'pay' })
      const payS1 = screen.getByRole('columnheader', { name: /R1/ }).textContent
      cleanup()
      renderHeatmap({ metric: 'emp' })
      const empS1 = screen.getByRole('columnheader', { name: /R1/ }).textContent
      expect(payS1).not.toBe(empS1)
      expect(empS1).toContain('100–300')
    })
  })
})
