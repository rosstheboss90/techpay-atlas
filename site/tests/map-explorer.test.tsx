import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapExplorer } from '../components/MapExplorer'
import { buildBubbles, MAP_H, MAP_W } from '../lib/map-bubbles'
import { RAMP_LIGHT } from '../lib/map-scales'
import { PATCH_PX } from '../lib/map-explore'
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

// Renders the svg at a known size so click coordinates are meaningful. jsdom lays nothing
// out, so the rect is stubbed — this is the only way to exercise the tap path at all.
function clickAt(svg: SVGSVGElement, vx: number, vy: number, scale = 1) {
  svg.getBoundingClientRect = () => ({
    left: 0, top: 0, width: MAP_W * scale, height: MAP_H * scale,
    right: MAP_W * scale, bottom: MAP_H * scale, x: 0, y: 0, toJSON: () => ({}),
  }) as DOMRect
  fireEvent.click(svg, { clientX: vx * scale, clientY: vy * scale })
}

// Real bubble positions, derived from the same projection the component itself uses via
// buildBubbles — never hardcoded, so these survive any future projection change.
const { bubbles: fixtureBubbles } = buildBubbles(meta, salaries, 'S', 'pay', false, RAMP_LIGHT)
const sanJose = fixtureBubbles.find(b => b.m.cbsa === '41940')!
const austin = fixtureBubbles.find(b => b.m.cbsa === '12420')!

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
    // Exact match, not /tap a metro/i — that substring also appears in the "missed" string,
    // so a loose match would pass even if the component opened already in the missed state.
    expect(document.querySelector('.mx-read')!.textContent).toBe('Tap a metro, or find it by name above.')
    expect(document.querySelector('.mx-ambig')).toBeNull()
  })

  it('moves focus into the dialog on open', () => {
    setup()
    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('a tap on a bubble names that metro and is not ambiguous', () => {
    const { container } = setup()
    const svg = container.querySelector('.mx-map') as SVGSVGElement
    clickAt(svg, sanJose.x, sanJose.y)
    expect(document.querySelector('.mx-read')!.textContent).toMatch(/San Jose/)
    expect(document.querySelector('.mx-ambig')).toBeNull()
  })

  it('a tap far from every bubble reports nothing there', () => {
    const { container } = setup()
    const svg = container.querySelector('.mx-map') as SVGSVGElement
    clickAt(svg, MAP_W - 1, MAP_H - 1)
    const text = document.querySelector('.mx-read')!.textContent!
    expect(text).toMatch(/nothing there/i)
    expect(text).not.toMatch(/San Jose|Austin/)
  })

  it('an ambiguous tap reports the rival count', () => {
    // A scale small enough that both fixture metros land inside one 22px thumb patch —
    // derived from their real projected distance, not a hardcoded coordinate pair.
    const dist = Math.hypot(sanJose.x - austin.x, sanJose.y - austin.y)
    const scale = (PATCH_PX / dist) * 0.9
    const { container } = setup()
    const svg = container.querySelector('.mx-map') as SVGSVGElement
    clickAt(svg, sanJose.x, sanJose.y, scale)
    const ambig = document.querySelector('.mx-ambig')
    expect(ambig).not.toBeNull()
    expect(ambig!.textContent).toMatch(/1/)
  })
})
