'use client'
import { useEffect, useState } from 'react'

/** Anchor targets are the existing section headings (they already carry ids for
 *  aria-labelledby), plus the map row. Keep in sync with the ids in page.tsx and
 *  the section components. */
const LINKS = [
  { id: 'sec-map', label: 'Pays most?' },
  { id: 'h2h-h', label: 'Underpaid?' },
  { id: 'slope-h', label: 'Goes far?' },
  { id: 'trend-h', label: 'Inflation?' },
  { id: 'tl-h', label: 'Really called?' },
  { id: 'rsim-h', label: 'What else?' },
  { id: 'hm-heading', label: 'The grid' },
]

export function SectionNav() {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const targets = LINKS.map(l => document.getElementById(l.id)).filter((el): el is HTMLElement => el != null)
    if (targets.length === 0) return

    // Track every target's ratio and pick the topmost one currently on screen,
    // so the highlight follows reading order rather than whichever entry fired last.
    const visible = new Map<string, number>()
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top)
          else visible.delete(e.target.id)
        }
        if (visible.size === 0) return
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0]
        setActive(top[0])
      },
      { rootMargin: '-56px 0px -60% 0px' },
    )
    for (const t of targets) obs.observe(t)
    return () => obs.disconnect()
  }, [])

  return (
    <nav className="secnav" aria-label="Sections">
      {LINKS.map(l => (
        <a key={l.id} href={`#${l.id}`} className={active === l.id ? 'is-active' : undefined}
           aria-current={active === l.id ? 'true' : undefined}>
          {l.label}
        </a>
      ))}
    </nav>
  )
}
