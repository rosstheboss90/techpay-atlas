# Home restructure — question spine + mobile question index

**Date:** 2026-08-10 · **Status:** Approved

## Purpose

Re-order and re-frame the home page around the questions a reader arrives with, instead of the
chart types the sections happen to be. The audience was settled 2026-08-07 (BACKLOG "Narrative
reconciliation"): someone answering **one specific question about their own pay** — the specific
answer is the hook, the honesty material and the time dimension are the payoff. The current nav
(*Map · Cost of living · Head to head · Job titles · Similar roles · City × role*) names what each
chart **is**; a reader scans for the question matching theirs and finds none.

Second goal, added during brainstorming: **mobile-friendly**. The page is ~6,600px of scroll on
mobile after the visual-polish pass (deliberate then; the restructure is the right moment to fix
it properly).

## Decisions

Made via mockup rounds (artifact 2026-08-10), recorded with alternatives:

| Decision | Chosen | Rejected |
|---|---|---|
| Mobile shape | **Question index**: sections collapse to question cards with a one-line computed answer; tap expands inline | Full expanded scroll (keeps ~6,600px); index-everywhere (hides the charts that make first paint compelling) |
| Desktop shape | **Full scroll in the new order**, map stays the hero | Question index on desktop |
| Spine vs hero conflict | **D1**: a one-line collapsible *title strip* above the map answers "what's your job actually called?" without dethroning the map; the full title lens moves later | D2 strict spine (title lens leads; text-heavy first paint, map below the fold) |
| Thesis surfacing | The `/about` hook line under the masthead: *"Official data tells you the number. This tells you what the number leaves out."* | Leaving it buried behind the masthead link |
| `trends.json` failure | Degrades gracefully (teaser shows fallback; page renders) — folds in the ⚪ 2026-08-09 review finding that a missing `trends.json` blanks the whole page | Keeping the hard failure |

## Architecture

### Section order (desktop, top to bottom)

| # | Section | Question heading | Content |
|---|---|---|---|
| 1 | Masthead | — | + thesis line, + filter bar (unchanged) |
| 2 | **Title strip** (new) | What's your job actually called? | One line: top real alias for the selected role → its BLS name; expands to a teaser linking to §7 |
| 3 | Map + metro panel | What does it pay — and where? | Unchanged internals |
| 4 | Head to head | Are you underpaid? | Unchanged internals (target-salary percentile fixed in PR #18) |
| 5 | COL slopegraph | Is it real money there? | Unchanged internals |
| 6 | **Trends teaser** (new) | Is it holding up? | One computed line (national real change since 2021 for the role) + link to `/trends` carrying the role |
| 7 | Title lens (full) | What do these jobs actually get called? | Unchanged internals |
| 8 | Role similarity | What else could you be? | Unchanged internals |
| 9 | Heatmap | Every metro × every role | Unchanged internals; framed as the reference grid |

`SectionNav` keeps the same anchor ids, labels become short question forms. On narrow viewports
the nav is hidden — the index *is* the nav.

### Components

- **`QuestionSection`** (new): wraps each of §3–§9. Desktop: renders the question heading + children
  directly. Narrow: renders a collapsed card — question + one-line answer + `open ▾` — and mounts
  children only when expanded (heavy D3 sections never render offscreen). Button semantics:
  `aria-expanded` + `aria-controls`.
- **`TitleStrip`** (new, §2): its own component, collapsible on *all* viewports (one line → teaser
  with a link to §7). On narrow it visually matches the question cards; it is not a
  `QuestionSection` because desktop also collapses it.
- **`lib/teasers.ts`** (new): pure functions computing each card's one-line answer from
  already-loaded data (see joins). Unit-tested in isolation, per repo practice.
- **Narrow detection**: `matchMedia` after mount (the page is fully client-rendered — `'use client'`,
  data fetched client-side — so there is no no-JS state to design for). Breakpoint: reuse the site's
  existing narrow breakpoint in `globals.css`; the plan pins the exact px.
- **Deep links**: on load, a `location.hash` matching a section id on narrow auto-expands that card
  and scrolls to it — shared links keep landing somewhere real.

## Data sources & joins

No new data files; every teaser derives from what the page already loads.

| Card | Source | Derivation |
|---|---|---|
| Title strip / §7 | `titles.json` | Highest-filing bucket whose dominant SOC is the selected role → "Called *{bucket label}*? BLS counts you as *{role}*" |
| §3 pay | `trends.json` (national) + `salaries.json` | Latest national median for the role; top metro by p50 |
| §4 underpaid | — | Static invitation ("Type your offer, see where it lands in any two metros") — no number without user input |
| §5 real money | `salaries.json` + `meta.json` RPP | The metro whose rank falls furthest for this role once COL-adjusted (same derivation family as the slopegraph) |
| §6 holding up | `trends.json` | National real change since 2021, e.g. "−5.7% in real terms since 2021" |
| §8 similar | `salaries.json` | Count of pay-overlap-equivalent roles (RoleSimilarity's existing derivation) |
| §9 grid | — | Static line |

## UI

- Question headings replace the current section headings; ids stay (`sec-map`, `slope-h`, …).
- Cards on narrow: question bold, answer line in secondary ink, `open ▾` affordance; expanded card
  shows the full section inline with a `close ▴`.
- Thesis line: one italic line under the masthead, styled within the existing masthead block.
- Both themes via existing tokens; no new colors.

**Honesty constraints (design invariants, not polish):** teaser lines obey the sitewide rules —
"adjusted" only ever means cost of living; a teaser never states a number the expanded section
doesn't show with its caveats; thin-sample chips and censoring notes appear on expansion exactly
as today; no teaser rounds away a suppression.

## Error handling

| Case | Behavior |
|---|---|
| `trends.json` fails to load | §6 teaser shows "Trend data unavailable"; page renders everything else (removes the current hard failure in `page.tsx`) |
| Role absent from `titles.json` buckets | Title strip falls back to the generic line ("See what these jobs are really called") |
| Role missing from a teaser's source row | Card renders the question with a generic answer line, never a blank or NaN |
| Hash points at a section that doesn't exist | Ignored; index renders normally |
| Viewport crosses the breakpoint while open | Sections stay mounted; layout swaps card chrome for headings (no state loss) |

## Testing

| Layer | Coverage |
|---|---|
| Unit (`site/tests`) | `lib/teasers.ts` pure functions: each derivation + each fallback row above |
| Component | `QuestionSection`: collapse/expand, `aria-expanded`, children not mounted while collapsed, hash auto-expand |
| e2e (new) | Mobile-viewport spec (390×844): total collapsed index height < 1800px (≈2 viewport heights — the "fits ~2 screens" promise, pinned), tap expands a section and its chart renders, URL hash deep-link expands |
| e2e (updated) | Existing desktop specs updated for the new section order; RPP guard specs untouched and must stay green |

## Out of scope

- `/about` redesign (stays its own visual system; only its hook line is quoted).
- Any change to chart internals, derivations, or the data contract.
- `/trends` and `/employers` pages.
- The heatmap per-column color-scale question (separate backlog item).
- PERM / multi-year LCA / conflation matrix (separate roadmap items).
