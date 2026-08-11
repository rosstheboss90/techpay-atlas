'use client'
import { useEffect, useState } from 'react'
import { loadTitles } from '../lib/data'
import type { TitlesJson } from '../lib/title-types'
import { titleTeaser } from '../lib/teasers'

/** §2 of the question spine: "What's your job actually called?" as one line above the map,
 *  collapsible on every viewport (deliberately NOT a QuestionSection — desktop collapses it
 *  too, see the D1 decision in the spec). Loads titles.json itself; TitleLens keeps its own
 *  load (get() memoizes per URL) so its internals stay untouched. */
export function TitleStrip({ soc, roleLabel }: { soc: string; roleLabel: string }) {
  const [titles, setTitles] = useState<TitlesJson | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let on = true
    loadTitles().then(t => { if (on) setTitles(t) }).catch(() => { /* generic line stands */ })
    return () => { on = false }
  }, [])
  return (
    <div className="title-strip">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {titleTeaser(titles, soc, roleLabel)} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <p className="ts-more">
          Job ads and official statistics use different names. The title lens maps real filed
          titles — and their seniority ladders — onto the codes the numbers are published under.{' '}
          <a href="#tl-h">See the full ladder ↓</a>
        </p>
      )}
    </div>
  )
}
