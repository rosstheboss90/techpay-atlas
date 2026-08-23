import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapExplorer } from '../components/MapExplorer'
import type { Meta, Salaries } from '../lib/types'

const meta = {
  year: 2025, generated: '', roles: [], topCodeValue: 0, rppYear: 2024, lcaPeriod: '',
  sources: { oews: '', lca: [], hud: '', zipMatchRate: 1 },
  metros: [
    { cbsa: '41940', name: 'San Jose-Sunnyvale-Santa Clara, CA', state: 'CA', lat: 37.33, lng: -121.89, rpp: 130, lcaFilings: 0 },
    { cbsa: '12420', name: 'Austin-Round Rock-Georgetown, TX', state: 'TX', lat: 30.27, lng: -97.74, rpp: 99, lcaFilings: 0 },
  ],
} as unknown as Meta

const salaries: Salaries = {
  '41940': { S: { emp: 100, lq: 1, p10: 1, p25: 1, p50: 213110, p75: 1, p90: 1 } },
  '12420': { S: { emp: 50, lq: 1, p10: 1, p25: 1, p50: 128000, p75: 1, p90: 1 } },
}

const setup = (over: Partial<Parameters<typeof MapExplorer>[0]> = {}) =>
  render(<MapExplorer meta={meta} salaries={salaries} soc="S" metric="pay" adjusted={false}
                      dark={false} onSelect={vi.fn()} onClose={vi.fn()} {...over} />)

describe('MapExplorer', () => {
  it('is a modal dialog that opens on the fit-height zoom step', () => {
    setup()
    const dlg = screen.getByRole('dialog')
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(dlg).toHaveAttribute('data-zoom', 'fit')
  })

  it('zoom buttons change the active step', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /2×/ }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-zoom', '2x')
    await userEvent.click(screen.getByRole('button', { name: /Poster/ }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-zoom', 'poster')
  })

  it('renders one circle per placeable metro', () => {
    const { container } = setup()
    expect(container.querySelectorAll('.mx-bubble')).toHaveLength(2)
  })

  it('filtering by name selects that metro and closes', async () => {
    const onSelect = vi.fn(); const onClose = vi.fn()
    setup({ onSelect, onClose })
    await userEvent.type(screen.getByRole('searchbox'), 'austin')
    await userEvent.click(screen.getByRole('button', { name: /Austin/ }))
    expect(onSelect).toHaveBeenCalledWith('12420')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on the close button and on Escape', async () => {
    const onClose = vi.fn()
    setup({ onClose })
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('starts with an instruction, not a fabricated selection', () => {
    setup()
    expect(document.querySelector('.mx-read')!.textContent).toMatch(/tap a metro/i)
    expect(document.querySelector('.mx-ambig')).toBeNull()
  })
})
