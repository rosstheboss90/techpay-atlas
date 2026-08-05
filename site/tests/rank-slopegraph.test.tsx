import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RankSlopegraph } from '../components/RankSlopegraph'
import type { Meta, Salaries, SalaryRow } from '../lib/types'

const metro = (cbsa: string, name: string, rpp: number | null) =>
  ({ cbsa, name, state: name.slice(-2), lat: 0, lng: 0, rpp, lcaFilings: 0 })

const meta: Meta = {
  year: 2025, generated: '2026-08-05T00:00:00Z', topCodeValue: 239200, rppYear: 2024,
  lcaPeriod: 'FY2025 Q1–Q4', sources: { oews: '', lca: [], hud: '', zipMatchRate: 0.99 },
  roles: [{ soc: 'S1', label: 'Role One', short: 'R1' }],
  metros: [
    metro('AAAAA', 'Aville, CA', 200), // pricey hub: nominal #1 -> adjusted last
    metro('BBBBB', 'Btown, TX', 100),
    metro('CCCCC', 'Ccity, OH', 90),   // cheaper city: rises
    metro('DDDDD', 'Dport, PR', null), // excluded (no rpp)
    metro('EEEEE', 'Etown, NV', 100),
  ],
}
const row = (p50: number | null): SalaryRow => ({ emp: 100, lq: 1, p10: null, p25: null, p50, p75: null, p90: null })
const salaries: Salaries = {
  AAAAA: { S1: row(200_000) }, // adj 100,000 (rpp 200)
  BBBBB: { S1: row(180_000) }, // adj 180,000
  CCCCC: { S1: row(170_000) }, // adj 188,889
  DDDDD: { S1: row(160_000) },
  EEEEE: { S1: row(160_000) }, // adj 160,000
}

const renderSlope = (over: Partial<React.ComponentProps<typeof RankSlopegraph>> = {}) => {
  const onSelect = vi.fn()
  const { container } = render(
    <RankSlopegraph meta={meta} salaries={salaries} soc="S1" metric="pay" onSelect={onSelect} {...over} />,
  )
  return { onSelect, container }
}

describe('RankSlopegraph', () => {
  it('renders a node per side for each ranked metro (rpp-null excluded)', () => {
    const { container } = renderSlope()
    // 4 metros (D excluded) × 2 sides = 8 nodes
    expect(container.querySelectorAll('.slope-node')).toHaveLength(8)
    expect(container.querySelectorAll('.slope-row')).toHaveLength(4)
  })

  it('marks the pricey hub as a falling mover and the cheaper city as rising', () => {
    const { container } = renderSlope()
    // Aville: nominal #1 -> adjusted #4 (fell 3) => is-mover slope-fall
    expect(screen.getByText(/Aville, CA: rank 1 nominal, 4 adjusted \(fell 3\)/)).toBeInTheDocument()
    expect(screen.getByText(/Ccity, OH: rank 3 nominal, 1 adjusted \(rose 2\)/)).toBeInTheDocument()
    const mover = container.querySelector('.slope-row.is-mover.slope-fall')
    expect(mover).not.toBeNull()
  })

  it('clicking an SVG row and its sr-only button both select the metro', () => {
    const { onSelect, container } = renderSlope()
    fireEvent.click(container.querySelector('.slope-row')!) // first row = Aville (nominal #1)
    expect(onSelect).toHaveBeenCalledWith('AAAAA')
    onSelect.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /Ccity, OH/ }))
    expect(onSelect).toHaveBeenCalledWith('CCCCC')
  })

  it('is inert for non-pay metrics', () => {
    const { container } = renderSlope({ metric: 'emp' })
    expect(screen.getByText(/switch the metric to/i)).toBeInTheDocument()
    expect(container.querySelector('.slope-svg')).toBeNull()
  })

  it('shows an empty state when fewer than two metros are rankable', () => {
    const thin: Salaries = { AAAAA: { S1: row(200_000) } } // only one rankable
    render(<RankSlopegraph meta={meta} salaries={thin} soc="S1" metric="pay" onSelect={() => {}} />)
    expect(screen.getByText(/not enough pay data/i)).toBeInTheDocument()
  })
})
