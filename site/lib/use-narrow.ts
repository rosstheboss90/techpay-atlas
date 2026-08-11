'use client'
import { useEffect, useState } from 'react'

/** True below the site's narrow breakpoint (globals.css uses 720px). Starts false —
 *  the page tree only renders client-side after data load, so one narrow-detection
 *  render after mount is invisible in practice. */
export function useNarrow(query = '(max-width: 720px)'): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    setNarrow(mq.matches)
    const fn = (e: MediaQueryListEvent) => setNarrow(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return narrow
}
