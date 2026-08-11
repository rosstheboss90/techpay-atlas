'use client'
import { type ReactNode, useEffect, useRef, useState } from 'react'

interface Props {
  /** DOM id of the wrapped section's own heading (e.g. 'h2h-h'). While collapsed the card
   *  carries it (the heading isn't mounted), so nav anchors and hash links keep resolving;
   *  while open the child's own heading has it — never both at once. */
  anchorId: string
  question: string
  teaser: string
  narrow: boolean
  /** Expand on first render (hash deep-link) and scroll to the card. */
  initialOpen?: boolean
  children: ReactNode
}

/** Narrow viewports collapse a section to its question + one-line answer; desktop renders
 *  children untouched. Children mount only while expanded — the heavy D3 sections never
 *  render offscreen. `open` survives viewport crossings (component stays mounted). */
export function QuestionSection({ anchorId, question, teaser, narrow, initialOpen = false, children }: Props) {
  const [open, setOpen] = useState(initialOpen)
  const ref = useRef<HTMLElement>(null)
  // Scroll once on mount when opened by a hash deep-link. Deliberately NOT keyed on
  // initialOpen: like the open state above, later prop changes must not re-trigger it.
  useEffect(() => {
    if (initialOpen) ref.current?.scrollIntoView?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!narrow) return <>{children}</>
  return (
    <section ref={ref} className="qcard" id={open ? undefined : anchorId}>
      <button type="button" className="qcard-btn" aria-expanded={open}
              aria-controls={`${anchorId}-body`} onClick={() => setOpen(o => !o)}>
        <span className="qcard-q">{question}</span>
        <span className="qcard-a">{teaser}</span>
        <span className="qcard-tap" aria-hidden="true">{open ? 'close ▴' : 'open ▾'}</span>
      </button>
      <div id={`${anchorId}-body`} hidden={!open}>{open && children}</div>
    </section>
  )
}
