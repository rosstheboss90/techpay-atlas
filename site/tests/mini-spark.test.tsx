import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MiniSpark } from '../components/MiniSpark'

describe('MiniSpark', () => {
  it('draws segments split on nulls and an endpoint dot at the last real value', () => {
    const { container } = render(<MiniSpark series={[10, 12, null, 14, 16]} />)
    // null splits the line into two polylines; endpoint dot sits at the final point
    expect(container.querySelectorAll('polyline')).toHaveLength(2)
    expect(container.querySelector('circle')).not.toBeNull()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    // Card-width scaling (globals.css pins the rendered box to 280×30 via CSS, non-proportional
    // to the 280×30 viewBox) relies on preserveAspectRatio="none" so the line fills the box
    // instead of letterboxing.
    expect(container.querySelector('svg')).toHaveAttribute('preserveAspectRatio', 'none')
  })
  it('renders nothing with fewer than two real points', () => {
    const { container } = render(<MiniSpark series={[null, 12, null]} />)
    expect(container.querySelector('svg')).toBeNull()
  })
  it('an isolated point between nulls renders as a dot, not nothing (metro-trend convention)', () => {
    const { container } = render(<MiniSpark series={[10, null, 12, null, 20]} />)
    // no run has 2+ points except none — zero polylines; three circles: two isolated + endpoint
    expect(container.querySelectorAll('polyline')).toHaveLength(0)
    expect(container.querySelectorAll('circle')).toHaveLength(3)
  })
})
