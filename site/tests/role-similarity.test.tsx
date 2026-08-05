import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { RoleSimilarity } from '../components/RoleSimilarity'
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
