'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Meta, Metric, Salaries } from '../lib/types'
import { buildBubbles, MAP_H, MAP_W, statesPath } from '../lib/map-bubbles'
import { RAMP_DARK, RAMP_LIGHT } from '../lib/map-scales'
import { pickAt, zoomScale, type Zoom } from '../lib/map-explore'
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
  const [picked, setPicked] = useState<{ name: string; value: string; rivals: number } | null>(null)
  const [missed, setMissed] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
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

  const scale = zoomScale(zoom, box.w, box.h)

  const choose = useCallback((cbsa: string) => { onSelect(cbsa); onClose() }, [onSelect, onClose])

  const onMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const s = rect.width / MAP_W
    const { hit, rivals } = pickAt(bubbles, (e.clientX - rect.left) / s, (e.clientY - rect.top) / s, s)
    if (!hit) { setPicked(null); setMissed(true); return }
    setMissed(false)
    setPicked({
      name: hit.m.name,
      value: hit.v == null ? 'no data' : metric === 'pay' ? fmtUsdCompact(hit.v) : String(Math.round(hit.v)),
      rivals,
    })
  }

  return (
    <div className="mx" role="dialog" aria-modal="true" aria-label="Explore the map" data-zoom={zoom}>
      <div className="mx-bar">
        <MetroFilter metros={meta.metros} onSelect={choose} label="Find a city" />
        <div className="mx-zooms">
          {ZOOMS.map(({ z, label }) => (
            <button key={z} type="button" className="mx-zoom" data-z={z} aria-pressed={zoom === z}
                    onClick={() => setZoom(z)}>{label}</button>
          ))}
          <button type="button" className="mx-close" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="mx-mapwrap" ref={wrapRef}>
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} width={MAP_W * scale} height={MAP_H * scale}
             className="mx-map" onClick={onMapClick} aria-label="US metro map — tap a metro to select it">
          <path d={statesPath} className="map-states" />
          {bubbles.map(b => (
            <circle key={b.m.cbsa} className="mx-bubble" cx={b.x} cy={b.y} r={Math.max(b.r, 2.2)}
                    fill={b.fill} opacity={0.92} />
          ))}
        </svg>
      </div>

      <p className="mx-read" aria-live="polite">
        {picked == null
          ? (missed ? 'Nothing there — tap a metro, or find it by name above.' : 'Tap a metro, or find it by name above.')
          : (
            <>
              <b>{picked.name}</b> · {picked.value}
              {picked.rivals > 0 && (
                <span className="mx-ambig">
                  {' '}⚠ {picked.rivals} other metro{picked.rivals > 1 ? 's' : ''} under your thumb — zoom in or use the filter to be sure.
                </span>
              )}
            </>
          )}
      </p>
    </div>
  )
}
