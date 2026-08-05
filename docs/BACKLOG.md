# TechPay Atlas — Backlog

Newest decisions first. v1 (map + panel) shipped 2026-08-03.

## Site polish — description + custom domain (queued 2026-08-05, do after the v2 heatmap PR)

- **Plain-language description.** Replace the jargon-heavy copy — the site meta `description` in
  `site/app/layout.tsx` (currently "…official BLS data … real H-1B employer filings") and the
  GitHub repo About one-liner — with a layman's version, e.g. _"See what tech jobs actually pay
  across US cities — real salary ranges by role and location, adjusted for cost of living, built
  from public government data."_ Keep the README/CLAUDE intros consistent. (The repo About panel
  isn't editable via the automation tools — hand off the text to paste.)
- **Custom domain (URL).** Point the site at a custom domain (value TBD from user). Work:
  - add a `CNAME` — put it in `site/public/CNAME` so the static export carries it into `out/`;
  - **drop the base path** — a custom apex/subdomain serves at the root, so `NEXT_PUBLIC_BASE_PATH`
    must go from `/techpay-atlas` to empty in `.github/workflows/deploy.yml` **and** the CI build
    env in `ci.yml`; then re-verify `site/lib/data.ts`'s absolute-path prefixing under an empty
    base;
  - update the in-repo URL references (README "Live site", `CLAUDE.md` "Live:", and the
    deploy-target note below) to the new domain;
  - set the custom domain in the repo's Pages settings + DNS (manual).

## Title lens follow-ups (from final-review, 2026-08-04)

Closed 2026-08-05:
- ~~pmo bucket too thin (61 filings)~~ — labeled, not hidden (honesty rule): rows under
  `THIN_SAMPLE_FILINGS` (100, isolates pmo; next-thinnest is 307) carry a "thin sample" chip.
- ~~unused topEmployers payload~~ — wired into the site as a per-bucket "Top employers"
  disclosure (national medians of filed wages, never COL-adjusted).
- ~~tier `'V'` suffix in the IC-marker regex~~ — dropped; only I/II/III/IV are real suffixes
  in the scan, matching the senior-tier regex.
- ~~zipMatchRate population-change note~~ — the join now spans the ALL-SOC deduped population
  (title lens widened it from target-SOC-only). Measured ~0.99 vs the 0.85 floor, so the
  threshold stays a tripwire, not a live constraint; documented in `pipeline/config.ts`.

Still open:
- tiny-segment conflation-bar click targets (small SOC shares are hard to click/tab-to).

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
- ~~Deploy target decision~~ — DONE 2026-08-04: GitHub Pages via Actions
  (https://rosstheboss90.github.io/techpay-atlas/). New absolute paths must use the
  `NEXT_PUBLIC_BASE_PATH` prefix pattern in `site/lib/data.ts`.
- Playwright run against the static export (config currently tests `next dev` only)
- Employer-name mojibake repair (DOL double-encoding, ~16 names/quarter, cosmetic)

## Standing notes

- `capped`/`topCodeValue` machinery is live but the May-2025 OEWS vintage emits zero
  top-coded cells for our SOCs (183 cells legitimately exceed $239,200). Site handles
  both; re-check on next annual refresh.
- Annual data refresh: `npm run download` + manual HUD file + `npm run pipeline`.
