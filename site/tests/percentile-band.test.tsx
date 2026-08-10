import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { PercentileBand } from '../components/PercentileBand'
import type { SalaryRow } from '../lib/types'

const domain: [number, number] = [0, 300_000]

describe('PercentileBand', () => {
  it('a capped p90 renders a declared bound: band-capped class + "top earners above $X" aria', () => {
    const row: SalaryRow = {
      emp: 100, lq: 1,
      p10: 81660, p25: 100940, p50: 135670, p75: 166070, p90: 239200,
      capped: ['p90'],
    }
    const { container } = render(
      <PercentileBand row={row} rpp={null} adjusted={false} domain={domain} />,
    )
    const outer = container.querySelector('.band-outer')
    expect(outer).not.toBeNull()
    expect(outer!.classList.contains('band-capped')).toBe(true)

    const svg = container.querySelector('svg.pct-band')!
    const aria = svg.getAttribute('aria-label')!
    expect(aria).toContain('10th to 90th percentile: $81,660 to $239,200')
    expect(aria).toContain('top earners above $239,200')
  })

  it('a capped p50 drops the median tick and declares it', () => {
    const row: SalaryRow = {
      emp: 100, lq: 1,
      p10: 81660, p25: 100940, p50: 208000, p75: 220000, p90: 239200,
      capped: ['p50', 'p90'],
    }
    const { container } = render(
      <PercentileBand row={row} rpp={null} adjusted={false} domain={domain} />,
    )
    expect(container.querySelector('.band-median')).toBeNull()

    const svg = container.querySelector('svg.pct-band')!
    const aria = svg.getAttribute('aria-label')!
    expect(aria).toContain('median censored above $208,000')
  })

  it('uncapped rows render exactly as before (regression)', () => {
    const row: SalaryRow = {
      emp: 100, lq: 1,
      p10: 81660, p25: 100940, p50: 135670, p75: 166070, p90: 239200,
    }
    const { container } = render(
      <PercentileBand row={row} rpp={null} adjusted={false} domain={domain} />,
    )
    expect(container.querySelector('.band-median')).not.toBeNull()
    expect(container.querySelectorAll('.band-capped')).toHaveLength(0)

    const svg = container.querySelector('svg.pct-band')!
    expect(svg.getAttribute('aria-label')).toBe(
      '10th to 90th percentile: $81,660 to $239,200',
    )
  })

  it('adjusted mode: the declared bound uses the SAME adjusted value the band renders', () => {
    const row: SalaryRow = {
      emp: 100, lq: 1,
      p10: 81660, p25: 100940, p50: 135670, p75: 166070, p90: 239200,
      capped: ['p90'],
    }
    const { container } = render(
      <PercentileBand row={row} rpp={120} adjusted domain={domain} />,
    )
    const svg = container.querySelector('svg.pct-band')!
    const aria = svg.getAttribute('aria-label')!
    // 239200 / (120 / 100) = 199333.33... -> $199,333, NOT the raw $239,200
    expect(aria).toContain('top earners above $199,333')
    expect(aria).not.toContain('239,200')
  })
})
