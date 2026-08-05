import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HeadToHead } from '../components/HeadToHead'
import type { Meta, Salaries, SalaryRow } from '../lib/types'

const metro = (cbsa: string, name: string, rpp: number | null, lcaFilings: number) =>
  ({ cbsa, name, state: name.slice(-2), lat: 0, lng: 0, rpp, lcaFilings })

const meta: Meta = {
  year: 2025, generated: '2026-08-05T00:00:00Z', topCodeValue: 239200, rppYear: 2024,
  lcaPeriod: 'FY2025 Q1–Q4', sources: { oews: '', lca: [], hud: '', zipMatchRate: 0.99 },
  roles: [{ soc: 'S1', label: 'Role One', short: 'R1' }],
  metros: [
    metro('11111', 'Alpha, AA', 100, 20),
    metro('22222', 'Bravo, BB', 120, 5),
    metro('33333', 'Cee, CC', 100, 0), // no employer file
  ],
}
const row = (p50: number): SalaryRow =>
  ({ emp: 100, lq: 1, p10: 100_000, p25: 120_000, p50, p75: 180_000, p90: 220_000 })
const salaries: Salaries = { '11111': { S1: row(150_000) }, '22222': { S1: row(140_000) }, '33333': { S1: row(130_000) } }

const empFiles: Record<string, unknown> = {
  '11111': { cbsa: '11111', roles: { S1: { employers: [], sample: [130_000, 150_000, 170_000, 140_000, 160_000, 180_000], n: 20, p99: 300_000 } } },
  '22222': { cbsa: '22222', roles: { S1: { employers: [], sample: [120_000, 130_000], n: 2, p99: 200_000 } } },
}

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const cbsa = /employers\/(\d+)\.json/.exec(String(url))?.[1]
    const file = cbsa ? empFiles[cbsa] : undefined
    return Promise.resolve(file ? { ok: true, json: async () => file } : { ok: false, status: 404 })
  }))
}

const renderH2H = (over: Partial<React.ComponentProps<typeof HeadToHead>> = {}) => {
  const onSelect = vi.fn()
  const utils = render(
    <HeadToHead meta={meta} salaries={salaries} soc="S1" adjusted={false}
                metroA="11111" metroB="22222" onSelect={onSelect} {...over} />,
  )
  return { onSelect, ...utils }
}

describe('HeadToHead', () => {
  beforeEach(() => { vi.restoreAllMocks(); stubFetch() })

  it('defaults the two selects to the given distinct metros', () => {
    renderH2H()
    expect((screen.getByLabelText('Metro A') as HTMLSelectElement).value).toBe('11111')
    expect((screen.getByLabelText('Metro B') as HTMLSelectElement).value).toBe('22222')
  })

  it('changing A sets metro, changing B sets vs', () => {
    const { onSelect } = renderH2H()
    fireEvent.change(screen.getByLabelText('Metro A'), { target: { value: '22222' } })
    expect(onSelect).toHaveBeenCalledWith({ metro: '22222' })
    fireEvent.change(screen.getByLabelText('Metro B'), { target: { value: '33333' } })
    expect(onSelect).toHaveBeenCalledWith({ vs: '33333' })
  })

  it('draws both percentile bands on one shared scale', () => {
    const { container } = renderH2H()
    expect(container.querySelectorAll('.pct-band')).toHaveLength(2)
  })

  it('a target salary draws a marker and reports each metro’s percentile', () => {
    const { container } = renderH2H()
    fireEvent.change(screen.getByLabelText('Target salary'), { target: { value: '150000' } })
    expect(container.querySelectorAll('.pct-marker').length).toBeGreaterThanOrEqual(1)
    // 150k is Alpha's p50 -> 50th; Bravo's between p50(140k) and p75(180k)
    expect(screen.getByText(/about the 50th percentile/)).toBeInTheDocument()
  })

  it('plots the swarm for a healthy bundle but notes the thin one (n ≤ 2)', async () => {
    const { container } = renderH2H()
    await waitFor(() => expect(container.querySelectorAll('.h2h-swarm-svg .h2h-dot').length).toBeGreaterThan(0))
    expect(screen.getByText(/2 filings — too few to plot/)).toBeInTheDocument()
  })

  it('shows the no-filings note for a metro with lcaFilings 0 (no fetch)', () => {
    renderH2H({ metroB: '33333' })
    expect(screen.getByText(/No H-1B filings on record/)).toBeInTheDocument()
  })
})
