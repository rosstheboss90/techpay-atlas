'use client'
import { type ReactNode } from 'react'

interface Props {
  /** Eyebrow text: the reader question this section answers. */
  question: string
  /** The computed answer sentence, shown as the section's deck. */
  fact: string
  narrow: boolean
  children: ReactNode
}

/** Narrow viewports render each section as a poster: eyebrow question, deck sentence, then the
 *  real chart full-bleed. Nothing collapses — the charts ARE the visual language of the page
 *  (2026-08-23 spec). Desktop renders children untouched.
 *
 *  This component never owns a DOM id. Anchor ids (nav targets, hash deep-links) live on the
 *  child content itself — either the child's own heading or, for the map section, a div in
 *  page.tsx — because on desktop this component renders no wrapper element at all to hang an id
 *  on. The eyebrow below is a `<p>`, not a heading: the child already supplies the section's one
 *  real heading, and doubling it up would ship two headings with identical text. */
export function QuestionSection({ question, fact, narrow, children }: Props) {
  if (!narrow) return <>{children}</>
  return (
    <section className="qsec">
      <p className="qsec-q">{question}</p>
      {fact && <p className="qsec-deck">{fact}</p>}
      <div className="qsec-body">{children}</div>
    </section>
  )
}
