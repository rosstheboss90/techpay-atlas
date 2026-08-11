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

---

# Amendment v2.1 — full sentences, louder questions, masthead value line

**Date:** 2026-08-11 (after the base version shipped in PR #20 and was reviewed live by the
user) · **Status:** Approved (mockup rounds: v2 → v2.1 full-sentences → masthead M1)

User verdict on the shipped cards: right direction; presentation (cramped, quiet questions,
underdesigned minis, weak affordance) and verbiage (shorthand facts, mixed-register questions)
both need a pass. All addressed as one system:

## Copy — questions (ripple to desktop h2s, SectionNav labels, e2e assertions)

| id | Question (new) | Nav label |
|---|---|---|
| sec-map | Where does it pay the most? | Pays most? |
| h2h-h | Are you underpaid? *(unchanged)* | Underpaid? |
| slope-h | Does your salary go far there? | Goes far? |
| trend-h | Are wages beating inflation? | Inflation? |
| tl-h | What's this job really called? | Really called? |
| rsim-h | What else could you be? *(unchanged)* | What else? |
| hm-heading | How does it all compare? | The grid |

## Copy — facts become complete sentences (context lines absorbed → `context: ''` everywhere)

| Card | Fact sentence (happy) | Fallback sentence |
|---|---|---|
| sec-map | `{City} tops the map at {fmtUsd(p50)}.` | `Percentiles for every metro on the map.` |
| h2h-h | `Type your offer to see where it lands, in any two of {N} metros.` (N = meta.metros.length) | — (static) |
| slope-h | `{City} falls {n} place(s) once cost of living counts.` | `See who leapfrogs whom once cost of living counts.` |
| trend-h | `{roleLabel} are {down\|up} {x.x}% in real terms since {year}.` | `Trend data unavailable.` |
| tl-h | `Job ads say “{top alias}” — the statistics say {roleLabel}.` | `Real titles, mapped to the official codes.` |
| rsim-h | `{n} role(s) pay(s) like this one.` | `Not enough overlap to compare this role.` |
| hm-heading | `Every metro and every role, in one grid.` | — (static) |

The tl-h fact is now **dynamic**, which supersedes the earlier YAGNI deviation: `titles.json`
loads best-effort at page level (the memoized `get()` makes TitleStrip's own load free), and
`titleTeaser` supplies the alias. Consequence: **TitleStrip renders desktop-only** — on narrow
the card states the identical claim, and the same sentence twice on one screen is worse than
either alone.

## Presentation

- Card: 16px padding, 5–6px stack gap, subtle shadow; button is a flex ROW — text column +
  a circled chevron (30px, `--line` border, `--accent` glyph on `--accent-soft`) replacing the
  `open ▾` text entirely.
- `.qcard-q`: `--accent`, .78rem, weight 650 (louder eyebrow).
- `.qcard-fact`: 1.12rem, line-height 1.35, `text-wrap: balance` (full sentences wrap on two
  lines comfortably).
- Minis go full card width: sparkline and band scale to the column (CSS `width: 100%` on the
  viz svgs; MiniSpark height 30).
- Honesty rule unchanged: every number in a sentence is one its section shows.

## Masthead (M1) — all viewports

Order: `h1` → **value line** (new, plain): *"Check what your job really pays — by city, by
real job title, adjusted for what living there costs."* → thesis (existing italic line,
unchanged) → provenance, demoted to small type: `{role label} · {N} metros · BLS OEWS {year}`
(keeps the adjusted-mode suffix).

## Error handling deltas

| Case | Behavior |
|---|---|
| titles.json fails at page level | tl-h card uses the fallback sentence; TitleStrip (desktop) already handles its own failure |
| Any teaser fallback | Full-sentence fallbacks per table — still never blank/NaN |

## Testing deltas

- teasers tests updated to sentence outputs (happy + fallback per table, incl. the new
  `titleTeaser` page-level use and trend up/down verb).
- Heading sweep re-runs Task-6 style: e2e assertions to new questions; the page order-pin test
  updates to the new seven questions.
- Visual eyeball repeats (both themes, 390px, collapsed/expanded, metro-selected overflow path).
