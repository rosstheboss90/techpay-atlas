import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MetroFilter } from '../components/MetroFilter'

const metros = [
  { cbsa: '41940', name: 'San Jose-Sunnyvale-Santa Clara, CA', state: 'CA', lat: 0, lng: 0, rpp: 130, lcaFilings: 0 },
  { cbsa: '41860', name: 'San Francisco-Oakland-Berkeley, CA', state: 'CA', lat: 0, lng: 0, rpp: 128, lcaFilings: 0 },
  { cbsa: '12420', name: 'Austin-Round Rock-Georgetown, TX', state: 'TX', lat: 0, lng: 0, rpp: 99, lcaFilings: 0 },
]

describe('MetroFilter', () => {
  it('shows no results before anything is typed', () => {
    render(<MetroFilter metros={metros} onSelect={() => {}} />)
    expect(document.querySelector('.mf-results')).toBeNull()
  })

  it('matches on any part of the metro name, case-insensitively', async () => {
    render(<MetroFilter metros={metros} onSelect={() => {}} />)
    await userEvent.type(screen.getByRole('searchbox'), 'oakland')
    const results = document.querySelectorAll('.mf-result')
    expect(results).toHaveLength(1)
    expect(results[0].textContent).toContain('San Francisco')
  })

  it('reports no matches rather than rendering an empty list', async () => {
    render(<MetroFilter metros={metros} onSelect={() => {}} />)
    await userEvent.type(screen.getByRole('searchbox'), 'zzzz')
    expect(document.querySelector('.mf-empty')!.textContent).toContain('zzzz')
    expect(document.querySelector('.mf-result')).toBeNull()
  })

  it('selecting a result reports its cbsa', async () => {
    const onSelect = vi.fn()
    render(<MetroFilter metros={metros} onSelect={onSelect} />)
    await userEvent.type(screen.getByRole('searchbox'), 'austin')
    await userEvent.click(screen.getByRole('button', { name: /Austin/ }))
    expect(onSelect).toHaveBeenCalledWith('12420')
  })

  it('applies `limit` AFTER filtering, not before', async () => {
    // The first three entries deliberately do not match. A buggy slice-then-filter would
    // cut the list down to these three and return zero results; filter-then-slice returns 3.
    const many = [
      ...Array.from({ length: 3 }, (_, i) => ({
        cbsa: `x${i}`, name: `Decoy ${i}, NV`, state: 'NV', lat: 0, lng: 0, rpp: 100, lcaFilings: 0,
      })),
      ...Array.from({ length: 12 }, (_, i) => ({
        cbsa: String(i), name: `San Test ${i}, CA`, state: 'CA', lat: 0, lng: 0, rpp: 100, lcaFilings: 0,
      })),
    ]
    render(<MetroFilter metros={many} onSelect={() => {}} limit={3} />)
    await userEvent.type(screen.getByRole('searchbox'), 'san test')
    const results = document.querySelectorAll('.mf-result')
    expect(results).toHaveLength(3)
    // And they must be the matching ones, not the decoys.
    expect([...results].every(r => r.textContent!.includes('San Test'))).toBe(true)
  })
})
