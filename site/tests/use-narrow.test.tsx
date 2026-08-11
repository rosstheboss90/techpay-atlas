import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNarrow } from '../lib/use-narrow'

function mockMatchMedia(initial: boolean) {
  let listener: ((e: { matches: boolean }) => void) | null = null
  const mql = {
    matches: initial,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => { listener = fn },
    removeEventListener: () => { listener = null },
  }
  vi.stubGlobal('matchMedia', () => mql)
  return { fire: (matches: boolean) => act(() => listener?.({ matches })) }
}

describe('useNarrow', () => {
  it('reflects the initial match and tracks changes', () => {
    const mm = mockMatchMedia(true)
    const { result } = renderHook(() => useNarrow())
    expect(result.current).toBe(true)
    mm.fire(false)
    expect(result.current).toBe(false)
  })
})
