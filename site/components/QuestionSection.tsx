'use client'
import { type ReactNode } from 'react'

interface Props {
  /** DOM id for this section — nav anchors and hash links resolve to it. The section always
   *  owns it (there is no collapsed/expanded alternation any more). */
  anchorId: string
  /** Eyebrow text: the reader question this section answers. */
  question: string
  /** The computed answer sentence, shown as the section's deck. */
  fact: string
  narrow: boolean
  children: ReactNode
}

/** Narrow viewports render each section as a poster: eyebrow question, deck sentence, then the
 *  real chart full-bleed. Nothing collapses — the charts ARE the visual language of the page
 *  (2026-08-23 spec). Desktop renders children untouched. */
export function QuestionSection({ anchorId, question, fact, narrow, children }: Props) {
  if (!narrow) return <>{children}</>
  return (
    <section className="qsec" id={anchorId}>
      <h2 className="qsec-q">{question}</h2>
      <p className="qsec-deck">{fact}</p>
      <div className="qsec-body">{children}</div>
    </section>
  )
}
