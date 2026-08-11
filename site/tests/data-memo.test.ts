import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadTitles, __clearDataCache } from '../lib/data'

afterEach(() => {
  vi.unstubAllGlobals()
  __clearDataCache()
})

describe('data get() memoization', () => {
  it('concurrent + repeat loads of the same URL fetch once', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ fake: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const [a, b] = await Promise.all([loadTitles(), loadTitles()])
    const c = await loadTitles()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
    expect(c).toEqual(a)
  })

  it('a failed fetch is NOT memoized — the next call retries', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('net down'))
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ fake: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadTitles()).rejects.toThrow('net down')
    await expect(loadTitles()).resolves.toEqual({ fake: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
