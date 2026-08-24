import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlopeExplorer } from '../components/SlopeExplorer'
import type { Meta, Salaries, SalaryRow } from '../lib/types'

const metro = (cbsa: string, name: string, rpp: number | null) =>
  ({ cbsa, name, state: 'XX', lat: 0, lng: 0, rpp, lcaFilings: 0 })

const row = (p50: number): SalaryRow =>
  ({ emp: 100, lq: 1, p10: null, p25: null, p50, p75: null, p90: null })

// 30 rankable metros so the "Top 25" step is genuinely a cap, plus one with no cost-of-living
// index — that one can never appear in the ranking at any count.
const rankable = Array.from({ length: 30 }, (_, i) =>
  metro(String(1000 + i), `Metro ${i}, XX`, 80 + i))
const noRpp = metro('9999', 'Norpp City, PR', null)

const meta = {
  year: 2025, generated: '', topCodeValue: 0, rppYear: 2024, lcaPeriod: '',
  sources: { oews: '', lca: [], hud: '', zipMatchRate: 1 },
  roles: [{ soc: 'S1', label: 'Software Developers', short: 'SWE' }],
  metros: [...rankable, noRpp],
} as unknown as Meta

const salaries: Salaries = Object.fromEntries([
  ...rankable.map((m, i) => [m.cbsa, { S1: row(200_000 - i * 1_000) }]),
  [noRpp.cbsa, { S1: row(150_000) }],
])

const setup = (over: Partial<Parameters<typeof SlopeExplorer>[0]> = {}) =>
  render(<SlopeExplorer meta={meta} salaries={salaries} soc="S1"
                        roleLabel="Software Developers" onClose={vi.fn()} {...over} />)

const bodyRows = () => document.querySelectorAll('.sx-table tbody tr')

describe('SlopeExplorer', () => {
  it('is a modal dialog naming the role', () => {
    setup()
    const dlg = screen.getByRole('dialog')
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(dlg).toHaveAttribute('aria-label', expect.stringContaining('Software Developers'))
  })

  it('opens capped at the first step, not showing everything', () => {
    setup()
    expect(bodyRows()).toHaveLength(25)
    expect(screen.getByRole('button', { name: 'Top 25' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('offers an "All N" step computed from the data, excluding unrankable metros', () => {
    setup()
    // 30 rankable; the no-RPP metro must not be counted even though it has a median.
    expect(screen.getByRole('button', { name: 'All 30' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'All 31' })).not.toBeInTheDocument()
  })

  it('changing the count re-ranks rather than slicing — the caption tracks the visible set', () => {
    setup()
    expect(document.querySelector('.sx-basis')!.textContent).toContain('25 metros shown')

    fireEvent.click(screen.getByRole('button', { name: 'All 30' }))
    expect(bodyRows()).toHaveLength(30)
    expect(document.querySelector('.sx-basis')!.textContent).toContain('30 metros shown')
  })

  it('a metro with no cost-of-living index is explained, not silently ignored', async () => {
    setup()
    await userEvent.type(screen.getByRole('searchbox'), 'Norpp')
    await userEvent.click(screen.getByRole('button', { name: /Norpp City/ }))

    const note = document.querySelector('.sx-note')!
    expect(note.textContent).toContain('Norpp')
    expect(note.textContent).toMatch(/no cost-of-living index/i)
    expect(document.querySelector('.sx-table tr.is-hit')).toBeNull()
  })

  it('choosing a metro outside the current count widens the set so its row exists', async () => {
    setup()
    expect(bodyRows()).toHaveLength(25)
    // Metro 28 is 29th by pay — outside Top 25.
    await userEvent.type(screen.getByRole('searchbox'), 'Metro 28,')
    await userEvent.click(screen.getByRole('button', { name: /Metro 28/ }))

    expect(bodyRows()).toHaveLength(30)
    const hit = document.querySelector('.sx-table tr.is-hit')!
    expect(hit.textContent).toContain('Metro 28')
  })

  it('closes on the close button and on Escape', async () => {
    const onClose = vi.fn()
    setup({ onClose })
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('renders a rise/fall marker per row with an accessible description', () => {
    setup()
    const first = bodyRows()[0]
    const delta = first.querySelector('.sx-delta span')!
    expect(delta.getAttribute('aria-label')).toMatch(/rises|falls|no change/)
  })
})
