import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { PercentileBand } from '../components/PercentileBand'
import type { SalaryRow } from '../lib/types'

const domain: [number, number] = [0, 300_000]

describe('PercentileBand', () => {
  it('a capped p90 renders a declared bound: band-capped class + "top earners above $X" aria, median tick untouched', () => {
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
    // only p50 (not p90) suppresses the median tick
    expect(container.querySelector('.band-median')).not.toBeNull()

    const svg = container.querySelector('svg.pct-band')!
    const aria = svg.getAttribute('aria-label')!
    expect(aria).toContain('10th to 90th percentile: $81,660 to $239,200')
    expect(aria).toContain('top earners above $239,200')
  })

  it('a capped p50 (alone) drops the median tick and declares it, full aria locked', () => {
    const row: SalaryRow = {
      emp: 100, lq: 1,
      p10: 81660, p25: 100940, p50: 208000, p75: 220000, p90: 239200,
      capped: ['p50'],
    }
    const { container } = render(
      <PercentileBand row={row} rpp={null} adjusted={false} domain={domain} />,
    )
    expect(container.querySelector('.band-median')).toBeNull()
    // p50 alone must not mark the outer/inner rects capped
    expect(container.querySelectorAll('.band-capped')).toHaveLength(0)

    const svg = container.querySelector('svg.pct-band')!
    expect(svg.getAttribute('aria-label')).toBe(
      '10th to 90th percentile: $81,660 to $239,200, median censored above $208,000',
    )
  })

  it('a capped p75 declares the inner edge only: inner rect gets band-capped, outer does not', () => {
    const row: SalaryRow = {
      emp: 100, lq: 1,
      p10: 81660, p25: 100940, p50: 135670, p75: 166070, p90: 239200,
      capped: ['p75'],
    }
    const { container } = render(
      <PercentileBand row={row} rpp={null} adjusted={false} domain={domain} />,
    )
    expect(container.querySelector('.band-inner')!.classList.contains('band-capped')).toBe(true)
    expect(container.querySelector('.band-outer')!.classList.contains('band-capped')).toBe(false)

    const svg = container.querySelector('svg.pct-band')!
    const aria = svg.getAttribute('aria-label')!
    expect(aria).toContain('p75 censored above $166,070')
  })

  it('a capped p10 declares the outer edge only: outer rect gets band-capped, inner does not', () => {
    const row: SalaryRow = {
      emp: 100, lq: 1,
      p10: 81660, p25: 100940, p50: 135670, p75: 166070, p90: 239200,
      capped: ['p10'],
    }
    const { container } = render(
      <PercentileBand row={row} rpp={null} adjusted={false} domain={domain} />,
    )
    expect(container.querySelector('.band-outer')!.classList.contains('band-capped')).toBe(true)
    expect(container.querySelector('.band-inner')!.classList.contains('band-capped')).toBe(false)

    const svg = container.querySelector('svg.pct-band')!
    const aria = svg.getAttribute('aria-label')!
    expect(aria).toContain('p10 censored above $81,660')
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

  it('adjusted mode: the marker rescales with the band — a marker at raw p50 sits on the median tick', () => {
    const row: SalaryRow = {
      emp: 100, lq: 1,
      p10: 81660, p25: 100940, p50: 135670, p75: 166070, p90: 239200,
    }
    const { container } = render(
      <PercentileBand row={row} rpp={120} adjusted domain={domain} marker={135670} />,
    )
    const median = container.querySelector('.band-median')!
    const marker = container.querySelector('.pct-marker')!
    expect(marker).not.toBeNull()
    expect(marker.getAttribute('x1')).toBe(median.getAttribute('x1'))
  })

  it('adjusted mode with unknown rpp: no marker (an unadjustable marker must not render raw)', () => {
    const row: SalaryRow = {
      emp: 100, lq: 1,
      p10: 81660, p25: 100940, p50: 135670, p75: 166070, p90: 239200,
    }
    const { container } = render(
      <PercentileBand row={row} rpp={null} adjusted domain={domain} marker={135670} />,
    )
    expect(container.querySelector('.pct-marker')).toBeNull()
  })

  it('degenerate copy: null p10/p90 + capped p50 states just the censor caption, no "not available" prefix', () => {
    const row: SalaryRow = {
      emp: 100, lq: 1,
      p10: null, p25: 100940, p50: 208000, p75: 220000, p90: null,
      capped: ['p50'],
    }
    const { container } = render(
      <PercentileBand row={row} rpp={null} adjusted={false} domain={domain} />,
    )
    const svg = container.querySelector('svg.pct-band')!
    expect(svg.getAttribute('aria-label')).toBe('median censored above $208,000')
  })
})
