# Mobile question index — answer-first cards with data-ink

**Date:** 2026-08-11 · **Status:** Approved

## Purpose

The mobile question index (shipped 2026-08-10) is structurally right but visually plain — text-only
bordered cards. Chosen via mockup round 2026-08-11: compose treatment **B** (answer-first stat
rows: the computed fact set large, the question as an eyebrow) with treatment **A**'s data-ink
(a tiny real visualization on cards that have one). Desktop rendering unchanged.

## Decisions

| Decision | Chosen | Rejected |
|---|---|---|
| Card anatomy | eyebrow (question, small caps) → **fact** (large, `tabular-nums`) → context line → optional mini-viz → open/close affordance | text-only cards (too plain); viz-first cards (viz without a stated fact) |
| Data-ink sourcing | reuse existing primitives and chart tokens only — `PercentileBand` for the band, the trends line token for a new ~20-line sparkline, bordered text chips | any new color (would require re-running the palette validator per the visual-polish constraints) |
| Mini-viz semantics | decorative previews, `aria-hidden` — the card's text carries every claim; the honesty rule (a card states only what its section shows) extends to the vizes | interactive minis (they sit inside the card button) |
| Teaser contract | `lib/teasers.ts` returns structured `{ fact, context }` (+ per-card viz data) | string-parsing the current one-liners in the component |

## Architecture

- `lib/teasers.ts` — each teaser returns `{ fact: string; context: string }`; `payTeaser` adds
  `top3: { city: string; p50: number }[]`; `similarTeaser` adds `topLabel: string | null`.
  All still pure and null-tolerant.
- `QuestionSection` — card button renders the new anatomy; gains an optional `viz?: ReactNode`
  prop rendered (aria-hidden container) between context and affordance. Desktop path untouched.
- New `components/MiniSpark.tsx` — inline SVG polyline of a `(number | null)[]` series
  (nulls skipped as gaps), 2px stroke in the trends line token, endpoint dot, fixed small
  viewBox, `aria-hidden`.
- Underpaid card's band: `PercentileBand` (existing component) for the default metro-A row —
  the same row the expanded section's default pair shows.

## Per-card mapping

| Card | Eyebrow | Fact | Context | Mini-viz |
|---|---|---|---|---|
| sec-map | What does it pay — and where? | `{fmtUsd(top.p50)} · {city}` | tops {N} metros | top-3 metro chips (`$213k San Jose` …) |
| h2h-h | Are you underpaid? | Where does your offer land? | type it, compare any two metros | `PercentileBand` of default metro A |
| slope-h | Is it real money there? | `{city} falls {n} place(s)` | once cost of living counts | — |
| trend-h | Is it holding up? | `{−5.7%} real` | since {headlineFrom} | sparkline of `roles[soc].real` |
| tl-h | What's your job actually called? | `“{bucket label}”` | is what BLS counts as {role} | — |
| rsim-h | What else could you be? | `{n} roles` | pay like this one | chip: top match + `+{n−1} more` |
| hm-heading | Every metro × every role | `{metros} × {roles}` | the whole grid, one screen | — |

## Error handling

| Case | Behavior |
|---|---|
| Fact's source row missing | Card falls back to the current generic line as its fact, plain context, no viz — never blank/NaN |
| `metric !== 'pay'` (slope card) | Fact "Rankings flip", generic context (extends the existing metric guard) |
| trends null (trend card) | Fact "Trend data unavailable", no sparkline |
| Series all-null (sparkline) | Viz omitted entirely |
| Metro-A row missing (band) | Band omitted, text unchanged |

## Testing

- `teasers.test.ts` updated for structured returns (every fact/context/fallback row above).
- `question-section.test.tsx`: card-anatomy test (eyebrow/fact/context rendered, viz container
  aria-hidden, affordance state) — existing collapse/anchor/scroll tests unchanged.
- New `mini-spark.test.tsx`: points from a series with nulls, endpoint dot present.
- e2e `mobile-index.spec.ts`: unchanged (button accessible names still contain the questions).
- Visual eyeball both themes at 390px, collapsed + expanded.

## Out of scope

- Desktop rendering (all viewports ≥720px unchanged), section internals, TitleStrip styling,
  any new data file or fetch, tooltips/interaction inside minis.
