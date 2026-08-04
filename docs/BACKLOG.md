# TechPay Atlas — Backlog

Newest decisions first. v1 (map + panel) shipped 2026-08-03.

## v2 candidates (unordered, unscoped)

- **Spec-owed sections**: rank-flip slopegraph · city × role heatmap (doubles as the
  accessibility table-fallback the spec owes) · head-to-head compare (must clamp beeswarm
  axis at bundle `p99`, decide thin-bundle policy — 39% of bundles have n ≤ 2)
- **Role similarity / equivalency** (user-requested 2026-08-03):
  1. wage-profile clustering across metros from shipped salaries.json (cheap)
  2. H-1B `JOB_TITLE` ↔ SOC conflation matrix — needs pipeline extension (title retained,
     normalized, emitted); the novel one
  3. O*NET skill-vector similarity per SOC (new small data source)
- **Map zoom/pan to select areas** (user-requested 2026-08-03; browser zoom is the
  accepted workaround for now)
- **Deploy target decision** (Vercel vs GitHub Pages) — decide BEFORE more absolute
  `/data/...` paths accumulate (`site/lib/data.ts` is the only affected file today)
- Playwright run against the static export (config currently tests `next dev` only)
- Employer-name mojibake repair (DOL double-encoding, ~16 names/quarter, cosmetic)

## Standing notes

- `capped`/`topCodeValue` machinery is live but the May-2025 OEWS vintage emits zero
  top-coded cells for our SOCs (183 cells legitimately exceed $239,200). Site handles
  both; re-check on next annual refresh.
- Annual data refresh: `npm run download` + manual HUD file + `npm run pipeline`.
