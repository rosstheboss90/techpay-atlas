# Mobile poster — uncollapsed sections, data-forward, map as poster + explorer

**Date:** 2026-08-23 · **Status:** Draft for review

## Purpose

The mobile view (question cards, shipped 2026-08-10, iterated to v2.1 on 2026-08-11) is structurally
sound but reads as seven identical quiet rectangles. Measured at 390px: **442px of the 844px first
screen is chrome** before any content, and the whole collapsed page renders **2 SVG elements** — the
map, heatmap and slopegraph that give this site its identity produce zero pixels until tapped.

This redesign makes the charts themselves the visual language: nothing collapses, every section
renders its real chart, and the map becomes a full-bleed hero. Desktop rendering is unchanged.

Chosen through five decision rounds with the user (mockups under `.superpowers/brainstorm/`), each
backed by measurement rather than preference.

## Decisions

| Decision | Chosen | Rejected |
|---|---|---|
| Scope | Structure and style as one system | Restyle-only; restructure-only |
| Visual register | **Data-forward / poster** — charts are the decoration, full-bleed, ink over colour | Editorial-loud (type-driven); app-like vivid (would re-open the palette validation pinned at `globals.css:15-18,43-48`) |
| Collapse | **Removed on narrow.** Every section renders its real chart | Keeping the card collapse; poster miniatures behind a tap |
| Page shape | **Re-weighted** — all 7 questions kept, vertical budget allocated by importance (~3,900px) | Faithful (5,687px — a third of it one list); curated edit (3,038px, but three questions leave the page) |
| Wayfinding | **Sticky role/metric bar only** (~40px) | Sticky rail + section chips (62px); no chrome at all; scroll-snap (measured 2.8× page inflation) |
| Map selection | **Poster hero (not tappable) + name filter + fullscreen explorer** | Enlarged hit targets; nearest-bubble; disambiguation popover — all measured below |
| Zoom mechanism | **Three discrete steps** (fit-width / fit-height / 2×) with native `overflow:auto` panning | Pinch gestures — no precedent in this repo, and Playwright cannot assert them |

### Why the map stops being an input

Measured against all 387 real metro positions at 390px, simulating aimed taps with a 2D Gaussian
touch error of σ = 8px (60 trials per metro):

| Rule | Selects something | Selects the **right** city |
|---|---|---|
| Current (actual bubble radius) | 14.6% | **2.5%** |
| Transparent 22px hit targets | 93.8% | **23.5%** |
| Nearest bubble within 44px | 99.9% | **26.4%** |
| Offer everything under the thumb | 99.9% | 100%, but the list is **14 cities** (median), 27 at p90 |

Median bubble radius at 390px is **1.0px**; **0 of 387** bubbles reach even a 22px target, and
**99% of metros have a rival inside a single 44px thumb patch**. Enlarging targets does not buy
accuracy — it converts honest misses into silent wrong answers, which on this site is the worst
available outcome.

Zoom and filtering change the density itself, which is the only transformation that helps (touch
error is a property of the finger and does not shrink). Realistic fullscreen map area (~610px tall
after the filter bar and readout):

| Visible metros | Fit height | + 2× |
|---|---|---|
| all 387 | 66% | 90% |
| top 100 | 85% | 97% |
| top 50 | 91% | 97% |
| top 25 | 95% | 97% |

Fullscreen alone is **not** sufficient for all 387 — hence the filter is load-bearing, not
decorative. Nothing exceeds ~97%: that ceiling is σ itself, which is why ambiguous selections are
labelled rather than smoothed over (see Invariants).

## Invariants

1. **Capped, never hidden.** Every truncation states its full count and expands **in place** — no
   route change, no navigation away. `RoleHeatmap` already implements exactly this
   (`TOP_N = 50`, live `{rows.length} metros`, `Show all 393`); it is the reference implementation.
2. **Ambiguity is labelled, never laundered.** A map selection with rivals inside the thumb patch
   says so. Extends the existing "small samples are labelled, never hidden" rule.
3. **No new colour.** Everything rides `--accent`, the existing `--soc-*` slots and the map ramps.
   The palette validation pinned to `--surface` is not re-opened.
4. **A section's deck may only state a number that section shows.** The existing teaser-honesty
   rule, now easier to satisfy because every section is always rendered.
5. **Desktop is untouched.** All changes are inside `@media (max-width: 720px)` or behind `narrow`.

## Architecture

| File | Change |
|---|---|
| `components/QuestionSection.tsx` | Narrow branch stops being a button. `{open && children}` → unconditional render; `aria-expanded`, `hidden`, chevron, `initialOpen` and the scroll effect all removed. Renders `<section id={anchorId}>` → eyebrow → deck → full-bleed children. Desktop pass-through unchanged. The anchor-id juggling described at `QuestionSection.tsx:5-7` disappears — the section always owns its id. |
| `lib/map-bubbles.ts` | **New.** Extract the bubble projection/scaling `useMemo` currently inside `SalaryMap.tsx:49-66` into a pure `buildBubbles(meta, salaries, soc, metric, adjusted, ramp)` so the hero and the explorer share one implementation and one unit test. |
| `components/SalaryMap.tsx` | Consumes `buildBubbles`. Gains `interactive?: boolean` (default `true`); when `false` the bubbles render without handlers, `tabIndex` or hover, and the `<svg>` is `aria-hidden` with the hero's text carrying the claim. |
| `components/MapExplorer.tsx` | **New.** Fullscreen overlay: metro filter, three zoom steps, `overflow:auto` pan, tappable metros, selection readout with ambiguity count. |
| `components/MetroFilter.tsx` | **New.** Small typeahead over `meta.metros` (name → cbsa). Used by both the hero and `MapExplorer`. |
| `components/RoleSimilarity.tsx` | Cap the list at 5 on narrow with `See all 20 →` expanding in place; retune the two-line stacked row (`globals.css:515-525`). |
| `components/RoleHeatmap.tsx` | `TOP_N_NARROW = 15` as the default row cap below 721px (`TOP_N = 50` unchanged on desktop); the existing toggle label reads from the active cap so it says "Show top 15" rather than a hardcoded 50. Sticky left row-header column. No change to its search or scroll logic. |
| `components/FilterBar.tsx` | No TSX change. Narrow CSS turns it into one ~40px sticky row (overriding `globals.css:511-512`). Native `<select>` retained. |
| `components/TrendsTeaser.tsx` | Gains a full-bleed `MiniSpark` above its sentence — the section currently renders **no chart at all**. |
| `components/MiniSpark.tsx` | Unchanged component, promoted from card mini to section poster chart. |
| `lib/teasers.ts` | `payTeaser` takes `adjusted` + rpp so the hero number cannot contradict the recoloured map (open follow-up in `docs/BACKLOG.md`; the hero makes it a 44px contradiction). |
| `app/page.tsx` | Hero composition; masthead demotion; `MapExplorer` mount + open state. |
| `app/globals.css` | Narrow block rewritten: sticky bar, poster sections, full-bleed idiom, hero type scale. |

### Composition on narrow

```
sticky bar (~40px)     role · metric · cost-of-living          ← position:sticky, top:0
masthead (~90px)       h1 + value line                          ← scrolls away
§1 hero (844px)        full-bleed map (poster, not tappable)
                       $213,110 / SAN JOSE, CA / highest of 393
                       [ filter a city ]  [ Explore the map → ]
                       MetroPanel renders here when a metro is selected
§2 (620px)             Are you underpaid?        → HeadToHead
§3 (560px)             Does your salary go far?  → RankSlopegraph
§4 (380px)             Beating inflation?        → MiniSpark + sentence + /trends
§5 (340px)             What's this job called?   → TitleLens
§6 (520px)             What else could you be?   → top 5 + See all 20 →
§7 (480px)             How does it compare?      → heatmap strip
footer (~200px)        thesis · provenance · About / Trends / Employers
```

Total ≈ **4,074px** (4.8 screens), against 6,392px measured for a naive uncollapse. (The 3,898px
figure from the page-shape mockup excluded the compressed masthead and used a lighter footer; the
number above is the sum of the blocks as specified here.)

**Full-bleed idiom:** `margin-inline: calc(var(--s4) * -1)` — the pattern `.secnav` already uses at
`globals.css:509`. No new technique.

### MapExplorer

- Opens from the hero; an overlay, so it costs no page height.
- Layout: filter bar (~100px) → `overflow:auto` map (~610px) → selection readout (~80px).
- Zoom steps: `poster` (fit width, = the hero), `fit` (fit height), `2x`. 4× measured as adding
  nothing over 2× and is omitted.
- Panning is native scrolling. Zoom changes preserve the viewport centre.
- Filtering to exactly one match scrolls it to centre and selects it — this is the 100%-accurate
  path and the reason filter and map are one feature rather than two.
- Selecting closes the overlay, sets `state.metro`, and scrolls to `MetroPanel` under the hero.
- Reduced motion: no transform animation on open/close.

## Data sources & joins

None added or changed. Same `meta.json` / `salaries.json` / `titles.json` / `trends.json`, same
lazy `employers/{cbsa}.json` on metro selection. `buildBubbles` is a pure refactor of existing
projection logic and must be output-identical for the desktop map.

## UI

- Sticky bar: opaque `--bg`, `border-bottom: var(--rule)`, `z-index` above chart content.
- Hero number: ~44px, weight 700, `tabular-nums`, `letter-spacing: -.045em`; place line in small
  caps with `.11em` tracking; support line at `--fs-meta`.
- Section eyebrow keeps `.qcard-q`'s treatment (accent, .78rem, uppercase, 650) under a new class.
- Deck keeps v2.1's sentence facts at ~1.12rem with `text-wrap: balance` — that copy work carries
  forward unchanged; only its position moves from card button to section standfirst.
- Both themes styled via `prefers-color-scheme`, verified at 390px.

## Error handling

| Case | Behaviour |
|---|---|
| `meta`/`salaries` fail | Existing page-level error, unchanged |
| `payTeaser` has no ranked row | Hero omits the number entirely and shows the map + fallback sentence — never a blank or `NaN` slot |
| `trends` null | Section keeps its fallback sentence, `MiniSpark` omitted (existing rule) |
| Trend series has < 2 non-null points | `MiniSpark` omitted, sentence unchanged |
| `titles` null | tl-h fallback sentence (existing) |
| Metro filter matches nothing | "No metros match “x”." — same idiom as `RoleHeatmap.tsx:121` |
| Explorer opened while the filter matches nothing | States render, no bubbles, empty message; no crash |
| Tap > 22px from every visible metro | Explicit "nothing selected" — **no** nearest-bubble guess |
| Tap with rivals inside the patch | Selection proceeds **and** names the rival count |
| Metro selected with no salary row for the role | Existing `MetroPanel` behaviour |
| `rpp == null` while adjusted | Existing "no cost-of-living index" handling |
| `geoAlbersUsa` cannot place a metro (PR) | Omitted from the map as today (`SalaryMap.tsx:53`), still reachable by filter |

## Testing

**Inverted — these currently assert the collapse and must be rewritten:**

| Test | Now asserts |
|---|---|
| `e2e/mobile-index.spec.ts:10` `.h2h` count 0 | `.h2h` **is** mounted at 390px |
| `e2e/mobile-index.spec.ts:14` height < 1800 | New budget: `main.page` scrollHeight < **4,400px** (≈8% headroom over the 4,074px design). If the built page exceeds it, that is a signal to re-weight sections — **not** to raise the pin; the whole point of shape B was that the budget is a design decision. |
| `e2e/mobile-index.spec.ts:17` tap-to-expand | Removed — chart is present without interaction |
| `e2e/mobile-index.spec.ts:21` hash auto-expands | Hash scrolls to the section (desktop behaviour, now shared) |
| `question-section.test.tsx` collapse/aria/initialOpen/scroll cases | Poster anatomy; children always mounted; desktop pass-through case **kept as-is** |
| `page.test.tsx:114-135,176` seven `.qcard-q` in order | Same seven questions, new eyebrow class — the order pin is retained deliberately (it once caught a silently dropped question) |

**New:**

- `map-bubbles.test.ts` — pure `buildBubbles`; must reproduce today's desktop bubble set exactly.
- `map-explorer.test.tsx` — zoom steps resize the svg; filter narrows the set; single match centres
  and selects; tap beyond range selects nothing; ambiguous tap reports the rival count.
- `metro-filter.test.tsx` — match, no-match message, selection callback.
- `role-similarity.test.tsx` — caps at 5 on narrow, states "20", expands in place to all 20.
- `role-heatmap.test.tsx` — sticky row header present at narrow; phone default row count.
- `trends-teaser.test.tsx` — sparkline rendered; omitted when the series is too sparse.
- e2e `mobile-index.spec.ts` — all seven sections mounted; height budget; explorer open → filter →
  select → `MetroPanel` visible; **`.rsim` section height < 700px** (the specific regression that
  made this redesign necessary).

**Manual:** both themes at 390px; the real device check the user has already been running against
the mockups.

## Out of scope

- **Desktop rendering (≥ 721px) — entirely unchanged.**
- Pinch/gesture zoom; 4× zoom step.
- Section inventory: all seven questions stay on the page. No new routes or pages.
- Any pipeline, emitted-data or `public/data/` change.
- `TitleStrip` remains desktop-only (v2.1 decision, unchanged).
- Colour/palette changes of any kind.
- The `context: ''` vestigial field on teasers — harmless, left for a separate cleanup.
