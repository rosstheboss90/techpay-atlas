import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TitleLens } from '../components/TitleLens'
import type { Meta } from '../lib/types'
import type { TitlesJson } from '../lib/title-types'
import { adjust } from '../lib/derive'
import { fmtUsd } from '../lib/format'

const meta = {
  year: 2025, generated: '2026-08-03T00:00:00Z', topCodeValue: 239200, rppYear: 2024,
  lcaPeriod: 'FY2025 Q1–Q4', sources: { oews: 'x', lca: [], hud: 'x', zipMatchRate: 0.99 },
  roles: [{ soc: '15-1252', label: 'Software Developers', short: 'SWE' }],
  metros: [
    { cbsa: '12420', name: 'Austin-Round Rock-San Marcos, TX', state: 'TX', lat: 30, lng: -97, rpp: 98.066, lcaFilings: 13136 },
  ],
} satisfies Meta

const titles: TitlesJson = {
  lcaPeriod: 'FY2025 Q1–Q4',
  families: [{
    key: 'pm', label: 'PM & Product',
    buckets: [
      {
        key: 'tpm', label: 'Technical Program Manager',
        national: { filings: 1860, p25: 148700, median: 173660, p75: 201200 },
        metros: { '12420': { filings: 126, p25: 148700, median: 161900, p75: 180482 } },
        tiers: {
          base: { filings: 883, p25: 135423, median: 162000, p75: 195000 },
          senior: { filings: 712, p25: 154648, median: 177914, p75: 195700 },
        },
        socMix: [
          { soc: '15-1299', share: 0.394 },
          { soc: '15-1252', share: 0.185 },   // in registry (meta.roles)
          { soc: '11-3021', share: 0.216 },   // NOT in registry
          { soc: 'other', share: 0.205 },
        ],
        topEmployers: [{ name: 'Amazon.com Services LLC', filings: 534, median: 169605 }],
      },
      {
        // National-only bucket: no metros entry at all -> always shows the national chip,
        // even when a metro the OTHER bucket recognizes is selected.
        key: 'devops', label: 'DevOps Engineer',
        national: { filings: 500, p25: 120000, median: 140000, p75: 160000 },
        metros: {},
        tiers: {},
        socMix: [{ soc: '15-1252', share: 1 }],
        topEmployers: [],
      },
    ],
  }],
}

function stubFetchOk() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => titles }))
}

describe('TitleLens', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('fetches once mounted (jsdom lacks IntersectionObserver -> eager fallback) and renders family tab + bucket rows', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => titles })
    vi.stubGlobal('fetch', spy)
    render(<TitleLens meta={meta} cbsa={null} adjusted={false} onSelectRole={() => {}} />)
    await waitFor(() => expect(screen.getByText('PM & Product')).toBeInTheDocument())
    expect(spy).toHaveBeenCalledWith('/data/titles.json')
    expect(screen.getByText('Technical Program Manager')).toBeInTheDocument()
    expect(screen.getByText('DevOps Engineer')).toBeInTheDocument()
    expect(screen.getByText(/1,860/)).toBeInTheDocument()
    expect(screen.getByText('$173,660')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PM & Product' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows an inline error card on fetch failure; page unaffected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    render(<TitleLens meta={meta} cbsa={null} adjusted={false} onSelectRole={() => {}} />)
    await waitFor(() => expect(screen.getByText(/couldn.t load/i)).toBeInTheDocument())
  })

  it('metro selection switches the matching bucket to metro stats with an "in Austin" chip; the metro-less bucket stays national', async () => {
    stubFetchOk()
    render(<TitleLens meta={meta} cbsa="12420" adjusted={false} onSelectRole={() => {}} />)
    await waitFor(() => expect(screen.getByText('Technical Program Manager')).toBeInTheDocument())
    expect(screen.getByText('$161,900')).toBeInTheDocument()   // tpm metro median
    expect(screen.getByText(/in Austin/)).toBeInTheDocument()
    expect(screen.getByText('$140,000')).toBeInTheDocument()   // devops national median (no metro data)
    expect(screen.getAllByText(/national/i).length).toBeGreaterThan(0)
  })

  it('adjusted mode: metro row shows the COL-divided value with an "(adj.)" marker; a bucket without that metro stays nominal national, no marker', async () => {
    stubFetchOk()
    render(<TitleLens meta={meta} cbsa="12420" adjusted={true} onSelectRole={() => {}} />)
    await waitFor(() => expect(screen.getByText('Technical Program Manager')).toBeInTheDocument())
    const tpmAdjMedian = fmtUsd(adjust(161900, 98.066, true))
    expect(screen.getByText(`${tpmAdjMedian} (adj.)`)).toBeInTheDocument()
    // devops has no '12420' metro entry -> stays national, never adjusted, no "(adj.)" marker
    expect(screen.getByText('$140,000')).toBeInTheDocument()
    expect(screen.queryByText('$140,000 (adj.)')).toBeNull()
  })

  it('adjusted mode: no band draws outside its track (regression for domain computed from nominal values while rows render adjusted ones)', async () => {
    // A dedicated fixture where the metro's rpp (60) diverges sharply from 100, so a domain
    // built from nominal stats (pre-fix) would clip the adjusted bar hard against the track
    // edge — both p25 and p75 collapse to the same clamped x, producing a zero-width band.
    const narrowMeta: Meta = {
      ...meta,
      metros: [{ cbsa: '99999', name: 'Expensive City, CA', state: 'CA', lat: 0, lng: 0, rpp: 60, lcaFilings: 100 }],
    }
    const narrowTitles: TitlesJson = {
      lcaPeriod: 'FY2025 Q1–Q4',
      families: [{
        key: 'pm', label: 'PM & Product',
        buckets: [{
          key: 'tpm', label: 'Technical Program Manager',
          national: { filings: 100, p25: 100000, median: 110000, p75: 120000 },
          metros: { '99999': { filings: 50, p25: 100000, median: 110000, p75: 120000 } },
          tiers: {},
          socMix: [{ soc: '15-1299', share: 1 }],
          topEmployers: [],
        }],
      }],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => narrowTitles }))
    const { container } = render(<TitleLens meta={narrowMeta} cbsa="99999" adjusted={true} onSelectRole={() => {}} />)
    await waitFor(() => expect(screen.getByText('Technical Program Manager')).toBeInTheDocument())
    expect(screen.getByText(/\(adj\.\)/)).toBeInTheDocument()
    const rect = container.querySelector('.tl-band-inner')!
    // Read the track width from the band's own coordinate space rather than
    // hard-coding it, so widening the band can't silently retire this guard.
    const track = Number(rect.closest('svg')!.getAttribute('width'))
    const x = Number(rect.getAttribute('x'))
    const w = Number(rect.getAttribute('width'))
    expect(track).toBeGreaterThan(0)
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x + w).toBeLessThanOrEqual(track)
    expect(w).toBeGreaterThan(0) // must not collapse to a zero-width sliver clamped at the edge
  })

  it('tier disclosure reveals seniority sub-rows only after expansion', async () => {
    stubFetchOk()
    render(<TitleLens meta={meta} cbsa={null} adjusted={false} onSelectRole={() => {}} />)
    await waitFor(() => expect(screen.getByText('Technical Program Manager')).toBeInTheDocument())
    expect(screen.queryByText('$162,000')).toBeNull()   // base tier median, not yet shown
    fireEvent.click(screen.getByText(/seniority/i))
    expect(screen.getByText('$162,000')).toBeInTheDocument()
    expect(screen.getByText('$177,914')).toBeInTheDocument()
  })

  it('top-employers disclosure is hidden until expanded, then lists name · median · filings; a bucket with none shows no toggle', async () => {
    stubFetchOk()
    render(<TitleLens meta={meta} cbsa={null} adjusted={false} onSelectRole={() => {}} />)
    await waitFor(() => expect(screen.getByText('Technical Program Manager')).toBeInTheDocument())
    // Exactly one "Top employers" toggle: tpm has one, devops has topEmployers: [] (no toggle).
    const toggles = screen.getAllByRole('button', { name: /top employers/i })
    expect(toggles).toHaveLength(1)
    expect(screen.queryByText('Amazon.com Services LLC')).toBeNull()
    fireEvent.click(toggles[0])
    expect(screen.getByText('Amazon.com Services LLC')).toBeInTheDocument()
    expect(screen.getByText(/\$169,605 · 534 filings/)).toBeInTheDocument()
  })

  it('labels a thin-sample bucket (< 100 national filings) and leaves fuller buckets unlabelled', async () => {
    const thinTitles: TitlesJson = {
      lcaPeriod: 'FY2025 Q1–Q4',
      families: [{
        key: 'pm', label: 'PM & Product',
        buckets: [
          { key: 'pmo', label: 'PMO',
            national: { filings: 61, p25: 120000, median: 140000, p75: 160000 },
            metros: {}, tiers: {}, socMix: [{ soc: '15-1299', share: 1 }], topEmployers: [] },
          { key: 'tpm', label: 'Technical Program Manager',
            national: { filings: 1860, p25: 148700, median: 173660, p75: 201200 },
            metros: {}, tiers: {}, socMix: [{ soc: '15-1299', share: 1 }], topEmployers: [] },
        ],
      }],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => thinTitles }))
    render(<TitleLens meta={meta} cbsa={null} adjusted={false} onSelectRole={() => {}} />)
    await waitFor(() => expect(screen.getByText('PMO')).toBeInTheDocument())
    expect(screen.getAllByText(/thin sample/i)).toHaveLength(1) // only PMO, not the 1,860-filing bucket
  })

  it('conflation bar renders per-segment aria-labels with share text', async () => {
    stubFetchOk()
    render(<TitleLens meta={meta} cbsa={null} adjusted={false} onSelectRole={() => {}} />)
    await waitFor(() => expect(screen.getByText('Technical Program Manager')).toBeInTheDocument())
    expect(screen.getByLabelText(/Software Developers.*19%/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Other.*21%/i)).toBeInTheDocument()
  })

  it('clicking a conflation segment in the role registry calls onSelectRole; other/out-of-registry segments no-op', async () => {
    stubFetchOk()
    const onSelectRole = vi.fn()
    render(<TitleLens meta={meta} cbsa={null} adjusted={false} onSelectRole={onSelectRole} />)
    await waitFor(() => expect(screen.getByText('Technical Program Manager')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText(/Software Developers.*19%/))
    expect(onSelectRole).toHaveBeenCalledWith('15-1252')

    fireEvent.click(screen.getByLabelText(/Other.*21%/i))
    fireEvent.click(screen.getByLabelText(/11-3021.*22%/))
    expect(onSelectRole).toHaveBeenCalledTimes(1)
  })

  it('non-interactive conflation segments (out-of-registry / "other") expose an accessible name via role=img (announced by screen readers, unlike role=generic)', async () => {
    stubFetchOk()
    render(<TitleLens meta={meta} cbsa={null} adjusted={false} onSelectRole={() => {}} />)
    await waitFor(() => expect(screen.getByText('Technical Program Manager')).toBeInTheDocument())
    expect(screen.getByRole('img', { name: /other.*21%/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /11-3021.*22%/ })).toBeInTheDocument()
    // clickable, in-registry segments remain role=button, not role=img
    expect(screen.getByRole('button', { name: /Software Developers.*19%/ })).toBeInTheDocument()
  })
})
