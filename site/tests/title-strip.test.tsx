import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const loadTitles = vi.fn()
vi.mock('../lib/data', () => ({ loadTitles: () => loadTitles() }))
import { TitleStrip } from '../components/TitleStrip'

const titles = {
  lcaPeriod: 'FY2025',
  families: [{ key: 'swe', label: 'SWE', buckets: [
    { key: 'swe', label: 'Software Engineer', national: { filings: 90000, p25: 1, median: 2, p75: 3 },
      metros: {}, tiers: {}, socMix: [{ soc: '15-1252', share: 0.9 }], topEmployers: [] },
  ] }],
}

afterEach(() => loadTitles.mockReset())

describe('TitleStrip', () => {
  it('renders the real-alias line once titles load, and expands to the lens link', async () => {
    loadTitles.mockResolvedValue(titles)
    render(<TitleStrip soc="15-1252" roleLabel="Software Developers" />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /“Software Engineer” is what BLS counts as Software Developers/ })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('link', { name: /full ladder/i })).toHaveAttribute('href', '#tl-h')
  })

  it('failed titles fetch leaves the generic line, no crash', async () => {
    loadTitles.mockRejectedValue(new Error('404'))
    render(<TitleStrip soc="15-1252" roleLabel="Software Developers" />)
    expect(await screen.findByRole('button', { name: /really called/i })).toBeInTheDocument()
  })
})
