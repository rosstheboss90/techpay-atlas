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

  it('links a head employer but NOT a tail employer, which has no page', async () => {
    // Only the head is emitted as employers-by-name/<slug>.json, and generateStaticParams
    // enumerates that directory — so linking a tail slug is a guaranteed 404. 28,300 of 28,800
    // filers are in that position.
    const loadShard = vi.fn().mockResolvedValue(shardOf([
      ['sheetz', 'Sheetz, Inc.', 3, 'direct', false, '15-2051', '11020', 68201],
    ]))
    render(<EmployerSearch head={head} loadShard={loadShard} />)
    await userEvent.type(screen.getByRole('searchbox'), 'sheetz')
    const tail = await screen.findByText('Sheetz, Inc.')
    expect(tail.closest('a')).toBeNull()
    expect(screen.getByText(/indexed only/i)).toBeInTheDocument()

    await userEvent.clear(screen.getByRole('searchbox'))
    expect(screen.getByText('Amazon').closest('a')).toHaveAttribute('href', '/employers/amazon')
  })

  it('derives the shard from the normalised query, not the raw one', async () => {
    // ".NET Solutions" normalises to "net-solutions", so the shard is `n`. Keying off the raw
    // first character asked for a `_` shard the pipeline never writes — a 404 the catch
    // swallows, silently contributing no tail results at all.
    const loadShard = vi.fn().mockResolvedValue(shardOf([]))
    render(<EmployerSearch head={head} loadShard={loadShard} />)
    await userEvent.type(screen.getByRole('searchbox'), '.NET Solutions')
    await waitFor(() => expect(loadShard).toHaveBeenCalledWith('n'))
    expect(loadShard).not.toHaveBeenCalledWith('_')
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
