import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import About from '../app/about/page'
import type { Meta, Salaries, SalaryRow } from '../lib/types'
import type { TitlesJson } from '../lib/title-types'

const metro = (cbsa: string, name: string, rpp: number) =>
  ({ cbsa, name, state: name.slice(-2), lat: 0, lng: 0, rpp, lcaFilings: 0 })

const meta: Meta = {
  year: 2025, generated: '', topCodeValue: 239200, rppYear: 2024, lcaPeriod: 'FY2025 Q1–Q4',
  sources: { oews: '', lca: [], hud: '', zipMatchRate: 0.99 },
  roles: [
    { soc: '15-1252', label: 'Software Developers', short: 'SWE' },
    { soc: '15-1243', label: 'Database Architects', short: 'DB Architect' },
  ],
  metros: [metro('11111', 'Alpha, CA', 130), metro('22222', 'Bravo, OH', 95)],
}
const p = (p50: number): SalaryRow => ({ emp: 100, lq: 1, p10: null, p25: null, p50, p75: null, p90: null })
const salaries: Salaries = {
  '11111': { '15-1252': p(200_000), '15-1243': p(190_000) },
  '22222': { '15-1252': p(150_000), '15-1243': p(148_000) },
}
const titles: TitlesJson = {
  lcaPeriod: 'FY2025 Q1–Q4',
  families: [{
    key: 'pm', label: 'PM & Product',
    buckets: [
      { key: 'tpm', label: 'Technical Program Manager', national: { filings: 100, p25: 0, median: 173_660, p75: 0 }, metros: {}, tiers: {}, socMix: [], topEmployers: [] },
      { key: 'techProjectMgr', label: 'Technical Project Manager', national: { filings: 100, p25: 0, median: 114_000, p75: 0 }, metros: {}, tiers: {}, socMix: [], topEmployers: [] },
    ],
  }],
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const u = String(url)
    const body = u.includes('meta') ? meta : u.includes('salaries') ? salaries : u.includes('titles') ? titles : null
    return Promise.resolve(body ? { ok: true, json: async () => body } : { ok: false, status: 404 })
  }))
})

describe('About page', () => {
  it('renders the narrative prose immediately (before data loads)', () => {
    render(<About />)
    expect(screen.getByRole('heading', { name: /round away/i })).toBeInTheDocument()
    expect(screen.getByText(/LOSS 01/)).toBeInTheDocument()
  })

  it('computes the conflation gap live from titles.json', async () => {
    render(<About />)
    // 173,660 - 114,000 = 59,660
    await waitFor(() => expect(screen.getByText('$59,660')).toBeInTheDocument())
    expect(screen.getByText('$173,660')).toBeInTheDocument()
    expect(screen.getByText('$114,000')).toBeInTheDocument()
  })

  it('computes the similarity ladder live (the anchor’s pay-twin appears, short label)', async () => {
    render(<About />)
    // Database Architects tracks Software Developers closely -> shows up (as its short label)
    await waitFor(() => expect(screen.getByText('DB Architect')).toBeInTheDocument())
  })

  it('links back to the atlas', () => {
    render(<About />)
    expect(screen.getByRole('link', { name: /TechPay Atlas/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /Open the live atlas/ })).toHaveAttribute('href', '/')
  })
})
