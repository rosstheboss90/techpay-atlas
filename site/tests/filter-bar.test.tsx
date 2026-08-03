// site/tests/filter-bar.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar } from '../components/FilterBar'

const roles = [
  { soc: '15-1252', label: 'Software Developers', short: 'SWE' },
  { soc: '15-2051', label: 'Data Scientists', short: 'Data Sci' },
]

describe('FilterBar', () => {
  it('renders role options and fires onChange', () => {
    const onChange = vi.fn()
    render(<FilterBar roles={roles} state={{ role: '15-1252', metric: 'pay', adjusted: false, metro: null }} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: '15-2051' } })
    expect(onChange).toHaveBeenCalledWith({ role: '15-2051' })
  })
  it('COL toggle is a pressed-state button', () => {
    const onChange = vi.fn()
    render(<FilterBar roles={roles} state={{ role: '15-1252', metric: 'pay', adjusted: true, metro: null }} onChange={onChange} />)
    const btn = screen.getByRole('button', { name: /cost of living/i })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn)
    expect(onChange).toHaveBeenCalledWith({ adjusted: false })
  })
})
