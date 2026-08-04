# TechPay Atlas — Backlog

Newest decisions first. v1 (map + panel) shipped 2026-08-03.

## Title lens follow-ups (from final-review, 2026-08-04)

pmo bucket too thin (61 filings, consider minBucketFilings) · tiny-segment conflation-bar
click targets · unused topEmployers payload in titles.json (wire into the site or drop
from emit) · tier `'V'` suffix in the IC-marker regex is inconsistent with the rest of the
seniority parser (only I/II/III/IV are real title suffixes seen in the scan) · zipMatchRate
population-change note (title lens widened the LCA population the match rate is computed
over — re-check THRESHOLDS.minZipMatchRate still means what it did pre-title-lens).

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
