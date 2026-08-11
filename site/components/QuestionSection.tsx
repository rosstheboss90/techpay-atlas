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
  const didScroll = useRef(false)
  // Scroll once, the first time this card actually renders as an open narrow card (on phones
  // the component mounts desktop-first while the narrow state settles — a mount-only effect
  // would fire against a null ref and never retry). Still deliberately ignores later
  // initialOpen changes once it has fired.
  useEffect(() => {
    if (narrow && initialOpen && !didScroll.current) {
      didScroll.current = true
      ref.current?.scrollIntoView?.()
    }
  }, [narrow, initialOpen])
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
