import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployerSearch } from '../components/EmployerSearch'
import type { EmployerHeadRow } from '../lib/employer-types'

const head: EmployerHeadRow[] = [
  { slug: 'amazon', display: 'Amazon', filings: 19944, category: 'direct', aliased: true, topRole: '15-1252' },
  { slug: 'cognizant', display: 'Cognizant', filings: 10381, category: 'staffing', aliased: true, topRole: '15-1252' },
]

const shardOf = (rows: (string | number | boolean)[][]) => ({
  k: ['slug', 'display', 'filings', 'category', 'aliased', 'topRole', 'topCbsa', 'median'],
  v: rows,
})

describe('EmployerSearch', () => {
  it('renders the head list before any typing, without fetching a shard', () => {
    const loadShard = vi.fn()
    render(<EmployerSearch head={head} loadShard={loadShard} />)
    expect(screen.getByText('Amazon')).toBeInTheDocument()
    expect(loadShard).not.toHaveBeenCalled()
  })

  it('matches the head by substring without fetching', async () => {
    const loadShard = vi.fn().mockResolvedValue(shardOf([]))
    render(<EmployerSearch head={head} loadShard={loadShard} />)
    await userEvent.type(screen.getByRole('searchbox'), 'ogniz')
    expect(await screen.findByText('Cognizant')).toBeInTheDocument()
  })

  it('fetches the shard for the typed first character and shows a tail hit by prefix', async () => {
    const loadShard = vi.fn().mockResolvedValue(shardOf([
      ['sheetz', 'Sheetz, Inc.', 3, 'direct', false, '15-2051', '11020', 68201],
    ]))
    render(<EmployerSearch head={head} loadShard={loadShard} />)
    await userEvent.type(screen.getByRole('searchbox'), 'sheetz')
    await waitFor(() => expect(loadShard).toHaveBeenCalledWith('s'))
    expect(await screen.findByText('Sheetz, Inc.')).toBeInTheDocument()
  })

  it('does not duplicate an employer present in both the head and its shard', async () => {
    const loadShard = vi.fn().mockResolvedValue(shardOf([
      ['amazon', 'Amazon', 19944, 'direct', true, '15-1252', '42660', 176000],
    ]))
    render(<EmployerSearch head={head} loadShard={loadShard} />)
    await userEvent.type(screen.getByRole('searchbox'), 'amazon')
    await waitFor(() => expect(loadShard).toHaveBeenCalledWith('a'))
    expect(await screen.findAllByText('Amazon')).toHaveLength(1)
  })

  it('hides known staffing firms when the toggle is on', async () => {
    render(<EmployerSearch head={head} loadShard={vi.fn()} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /staffing/i }))
    expect(screen.queryByText('Cognizant')).not.toBeInTheDocument()
    expect(screen.getByText('Amazon')).toBeInTheDocument()
  })

  it('tells the user the tail is matched from the start of the name', () => {
    render(<EmployerSearch head={head} loadShard={vi.fn()} />)
    expect(screen.getByText(/start of/i)).toBeInTheDocument()
  })
})
