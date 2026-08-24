'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Meta, Metric, Salaries } from '../lib/types'
import { buildBubbles, MAP_H, MAP_W, statesPath } from '../lib/map-bubbles'
import { RAMP_DARK, RAMP_LIGHT } from '../lib/map-scales'
import { pickAt, recentreAfterZoom, zoomScale, type ScrollView, type Zoom } from '../lib/map-explore'
import { fmtUsdCompact } from '../lib/format'
import { MetroFilter } from './MetroFilter'

interface Props {
  meta: Meta
  salaries: Salaries
  soc: string
  metric: Metric
  adjusted: boolean
  dark: boolean
  onSelect: (cbsa: string) => void
  onClose: () => void
}

const ZOOMS: { z: Zoom; label: string }[] = [
  { z: 'poster', label: 'Poster' },
  { z: 'fit', label: 'Fit height' },
  { z: '2x', label: '2×' },
]

/** Fullscreen map. The inline hero is a poster and deliberately not tappable; this is where
 *  selecting a city on the map actually works, because zooming is the only transformation that
 *  improves accuracy — touch error is a property of the finger and does not shrink, so growing
 *  a hit target only grows it into the neighbour. Panning is native scrolling. */
export function MapExplorer({ meta, salaries, soc, metric, adjusted, dark, onSelect, onClose }: Props) {
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [picked, setPicked] = useState<{ cbsa: string; name: string; value: string; rivals: number } | null>(null)
  const [missed, setMissed] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const prevViewRef = useRef<ScrollView | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  const ramp = dark ? RAMP_DARK : RAMP_LIGHT
  const { bubbles } = useMemo(
    () => buildBubbles(meta, salaries, soc, metric, adjusted, ramp),
    [meta, salaries, soc, metric, adjusted, ramp],
  )

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Minimal modal focus management (not a full focus trap): move focus into the dialog on
  // open so screen reader / keyboard users land inside it, and restore focus to whatever
  // triggered it on close so closing doesn't strand focus on <body>.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    rootRef.current?.focus()
    return () => prev?.focus?.()
  }, [])

  // Zoom preserves the viewport centre. Capture the outgoing scroll geometry on the click (the
  // container still has the OLD extent then), and restore it in a layout effect once React has
  // resized the svg — before paint, so the map never flashes at the wrong offset. The arithmetic
  // itself lives in map-explore.ts and is unit-tested there; jsdom cannot lay this container out.
  const changeZoom = useCallback((z: Zoom) => {
    const el = wrapRef.current
    if (el) {
      prevViewRef.current = {
        scrollLeft: el.scrollLeft, scrollTop: el.scrollTop,
        clientWidth: el.clientWidth, clientHeight: el.clientHeight,
        scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight,
      }
    }
    setZoom(z)
  }, [])

  useLayoutEffect(() => {
    const el = wrapRef.current
    const prev = prevViewRef.current
    prevViewRef.current = null
    if (!el || !prev) return
    const { scrollLeft, scrollTop } = recentreAfterZoom(prev, {
      clientWidth: el.clientWidth, clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight,
    })
    el.scrollLeft = scrollLeft
    el.scrollTop = scrollTop
  }, [zoom])

  const scale = zoomScale(zoom, box.w, box.h)

  const choose = useCallback((cbsa: string) => { onSelect(cbsa); onClose() }, [onSelect, onClose])

  const onMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    // Assumes .mx-map renders at its intrinsic proportions (width/MAP_W == height/MAP_H).
    // A max-width constraint on this element would letterbox it — preserveAspectRatio scales
    // both axes by the same factor while the box shrinks on only one, so rect.width/MAP_W and
    // rect.height/MAP_H would diverge and every tap would be silently mis-mapped on Y. The
    // stylesheet task must keep this element unconstrained (or this line must switch to
    // rect.height/MAP_H, whichever axis is letterboxed) — see task-7 review.
    const s = rect.width / MAP_W
    const { hit, rivals } = pickAt(bubbles, (e.clientX - rect.left) / s, (e.clientY - rect.top) / s, s)
    if (!hit) { setPicked(null); setMissed(true); return }
    setMissed(false)
    // A tap IDENTIFIES; the readout below commits. Selecting here would launder the ambiguity the
    // readout is about to state — the user must be able to read "3 other metros under your thumb"
    // and then decide to confirm or re-aim.
    setPicked({
      cbsa: hit.m.cbsa,
      name: hit.m.name,
      value: hit.v == null ? 'no data' : metric === 'pay' ? fmtUsdCompact(hit.v) : String(Math.round(hit.v)),
      rivals,
    })
  }

  return (
    <div className="mx" role="dialog" aria-modal="true" aria-label="Explore the map" data-zoom={zoom}
         ref={rootRef} tabIndex={-1}>
      <div className="mx-bar">
        <MetroFilter metros={meta.metros} onSelect={choose} label="Find a city" />
        <div className="mx-zooms">
          {ZOOMS.map(({ z, label }) => (
            <button key={z} type="button" className="mx-zoom" data-z={z} aria-pressed={zoom === z}
                    onClick={() => changeZoom(z)}>{label}</button>
          ))}
          <button type="button" className="mx-close" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="mx-mapwrap" ref={wrapRef}>
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} width={MAP_W * scale} height={MAP_H * scale}
             className="mx-map" onClick={onMapClick}
             aria-label="US metro map — tap a metro to name it, then confirm it in the readout below">
          <path d={statesPath} className="map-states" />
          {bubbles.map(b => (
            <circle key={b.m.cbsa} className="mx-bubble" cx={b.x} cy={b.y} r={Math.max(b.r, 2.2)}
                    fill={b.fill} opacity={0.92} />
          ))}
        </svg>
      </div>

      {/* The tap identifies a metro; THIS control commits it. Two steps, not one, because the
          ambiguity warning has to be readable on the same control that performs the selection —
          a tap that auto-selected would state the rival count only after the choice was already
          made, which is laundering it. A miss renders no control at all, so there is nothing to
          confirm and no nearest-bubble guess to accept by accident. */}
      <div className="mx-read" aria-live="polite">
        {picked == null
          ? (missed ? 'Nothing there — tap a metro, or find it by name above.' : 'Tap a metro, or find it by name above.')
          : (
            <button type="button" className="mx-confirm" onClick={() => choose(picked.cbsa)}>
              <span className="mx-confirm-head"><b>{picked.name}</b> · {picked.value}</span>
              {picked.rivals > 0 && (
                <span className="mx-ambig">
                  ⚠ {picked.rivals} other metro{picked.rivals > 1 ? 's' : ''} under your thumb — zoom in or use the filter to be sure.
                </span>
              )}
              <span className="mx-confirm-cta">Show this metro →</span>
            </button>
          )}
      </div>
    </div>
  )
}
