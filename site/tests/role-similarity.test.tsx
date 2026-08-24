import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { RoleSimilarity, NARROW_CAP } from '../components/RoleSimilarity'
import { MIN_SHARED } from '../lib/role-similarity'
import type { Meta, Salaries, SalaryRow } from '../lib/types'

const roles = [
  { soc: 'A', label: 'Anchor', short: 'A' },
  { soc: 'T', label: 'Twin', short: 'T' },
  { soc: 'H', label: 'Higher', short: 'H' },
  { soc: 'Z', label: 'Ghost', short: 'Z' }, // present in meta but absent from salaries
]
const cbsas = Array.from({ length: MIN_SHARED + 3 }, (_, i) => String(20000 + i))
const meta = {
  year: 2025, generated: '', topCodeValue: 239200, rppYear: 2024, lcaPeriod: '',
  sources: { oews: '', lca: [], hud: '', zipMatchRate: 0.99 }, roles,
  metros: cbsas.map(cbsa => ({ cbsa, name: `M ${cbsa}`, state: 'XX', lat: 0, lng: 0, rpp: 100, lcaFilings: 0 })),
} as unknown as Meta

const p = (p50: number): SalaryRow => ({ emp: 1, lq: 1, p10: null, p25: null, p50, p75: null, p90: null })
const salaries: Salaries = {}
cbsas.forEach((cbsa, i) => {
  const base = 120_000 + i * 1000
  salaries[cbsa] = { A: p(base), H: p(base * 1.1), ...(i < 3 ? { T: p(base) } : {}) } // T twin, but only 3 metros -> thin
})

describe('RoleSimilarity', () => {
  it('ranks the closest-paid role first for the anchor', () => {
    render(<RoleSimilarity meta={meta} salaries={salaries} soc="A" onSelectRole={() => {}} />)
    const names = screen.getAllByRole('button').map(b => b.textContent)
    expect(names[0]).toBe('Twin')   // overlap 1 (thin) beats Higher's 0.909
    expect(names).toContain('Higher')
    expect(names).not.toContain('Anchor') // anchor excluded
  })

  it('marks a thin pair with a chip', () => {
    render(<RoleSimilarity meta={meta} salaries={salaries} soc="A" onSelectRole={() => {}} />)
    const twinRow = screen.getByText('Twin').closest('.rsim-row')!
    expect(within(twinRow as HTMLElement).getByText(/thin · 3 metros/)).toBeInTheDocument()
  })

  it('clicking a role re-anchors via onSelectRole', () => {
    const onSelectRole = vi.fn()
    render(<RoleSimilarity meta={meta} salaries={salaries} soc="A" onSelectRole={onSelectRole} />)
    fireEvent.click(screen.getByText('Higher'))
    expect(onSelectRole).toHaveBeenCalledWith('H')
  })

  it('shows the empty state when the anchor has no comparable roles', () => {
    render(<RoleSimilarity meta={meta} salaries={salaries} soc="Z" onSelectRole={() => {}} />)
    expect(screen.getByText(/not enough overlap/i)).toBeInTheDocument()
  })
})

// One anchor ('A') plus seven comparison roles, each present in every metro so all seven
// clear MIN_SHARED and the list is long enough for the cap to bite.
const MANY_SOCS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const manyCbsas = Array.from({ length: MIN_SHARED + 3 }, (_, i) => String(30000 + i))

const manyMeta = {
  year: 2025, generated: '', topCodeValue: 239200, rppYear: 2024, lcaPeriod: '',
  sources: { oews: '', lca: [], hud: '', zipMatchRate: 0.99 },
  roles: MANY_SOCS.map(soc => ({ soc, label: `Role ${soc}`, short: soc })),
  metros: manyCbsas.map(cbsa => ({ cbsa, name: `Metro ${cbsa}`, state: 'XX', lat: 0, lng: 0, rpp: 100, lcaFilings: 0 })),
} as unknown as Meta

const manySalaries: Salaries = {}
manyCbsas.forEach((cbsa, i) => {
  manySalaries[cbsa] = {}
  MANY_SOCS.forEach((soc, j) => { manySalaries[cbsa][soc] = p(100000 + j * 5000 + i * 100) })
})

const renderWithManyRoles = ({ narrow }: { narrow: boolean }) =>
  render(<RoleSimilarity meta={manyMeta} salaries={manySalaries} soc="A"
                         onSelectRole={() => {}} narrow={narrow} />)

describe('RoleSimilarity narrow cap', () => {
  it('desktop shows every similar role and offers no expander', () => {
    const { container } = renderWithManyRoles({ narrow: false })
    expect(container.querySelectorAll('.rsim-row').length).toBe(MANY_SOCS.length - 1)
    expect(screen.queryByRole('button', { name: /see all/i })).not.toBeInTheDocument()
  })

  it('narrow shows five, states the TRUE total, and expands in place', () => {
    const { container } = renderWithManyRoles({ narrow: true })
    const total = MANY_SOCS.length - 1                       // 7 comparison roles
    expect(container.querySelectorAll('.rsim-row')).toHaveLength(NARROW_CAP)

    // "Capped, never hidden": the control states the full count, not the shown count.
    const more = screen.getByRole('button', { name: /see all \d+ roles/i })
    expect(more.textContent).toContain(String(total))
    expect(more.textContent).not.toContain(String(NARROW_CAP))

    fireEvent.click(more)
    expect(container.querySelectorAll('.rsim-row')).toHaveLength(total)
    expect(screen.queryByRole('button', { name: /see all/i })).not.toBeInTheDocument()
  })

  it('narrow does not cap a list that is already short', () => {
    const { container } = render(
      <RoleSimilarity meta={meta} salaries={salaries} soc="A" onSelectRole={() => {}} narrow />,
    )
    expect(container.querySelectorAll('.rsim-row').length).toBeLessThanOrEqual(NARROW_CAP)
    expect(screen.queryByRole('button', { name: /see all/i })).not.toBeInTheDocument()
  })
})
