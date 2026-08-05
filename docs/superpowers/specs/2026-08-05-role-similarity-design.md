# Role Similarity — v2 Design Spec

**Date:** 2026-08-05 · **Status:** Draft for review

## Purpose

The official occupation codes are distinct, but do they actually *pay* differently? This section
answers, for a chosen role, **which other roles are paid interchangeably** — the pay-equivalency
finder that extends the title-lens thesis (codes vs reality) to the whole role registry. Backlog
"Role similarity / equivalency," variant 1 (wage-profile from the shipped `salaries.json`).

Feasibility note: variants 2 (H-1B `JOB_TITLE`↔SOC matrix) and 3 (O*NET) need a pipeline extension
and a data regen from raw inputs not present in this environment. This spec is variant 1 only —
pure site work that completes end-to-end here.

## Decisions

1. **Metric = pay-overlap (equivalency), not correlation.** For roles X and Y, over the metros
   both cover, `overlap = median( min(p50ₓ, p50ᵧ) / max(p50ₓ, p50ᵧ) )` ∈ (0, 1]. 1.0 = pays
   identically in every shared metro; 0.8 = typically within 20%. This measures *are they the same
   dollars* (equivalency), which is the question — not correlation, which would call a role that
   always pays 2× another "similar." Also report the median ratio X/Y for direction.
2. **COL-invariant.** Both roles sit in the same metro, so the metro's RPP cancels in the ratio —
   the ranking is identical adjusted or not. The section therefore ignores the global adjust toggle
   for ranking (noted in the caption); displayed medians are the nominal cross-metro median p50.
3. **Confidence by shared-metro count.** Pairs with fewer than `MIN_SHARED` (40) shared metros are
   labeled "thin overlap" (kept, not hidden — honesty rule), and sorted after well-supported pairs
   at equal overlap.
4. **Anchored on the selected role.** Reads `state.role`; shows the other 20 roles ranked by
   overlap desc — the actionable "pays most like this" slice of a full clustering. A full role×role
   matrix / dendrogram is out of scope (a possible later extension).
5. **Cross-links.** Each listed role is clickable → `onSelectRole(soc)`, re-anchoring the whole page
   on it (same idiom as the title-lens conflation bar).

## Architecture

New pure `site/lib/role-similarity.ts` + component `site/components/RoleSimilarity.tsx`, mounted in
`page.tsx` (below the title lens — both are "codes vs reality" sections). No new data, no fetch, no
pipeline change — reads the already-loaded `meta` + `salaries`.

| Piece | Source |
|---|---|
| Per-role metro pay vector | `salaries[cbsa][soc].p50` across `meta.metros` |
| Pairwise overlap + ratio + shared count | new `similarByPay(meta, salaries, soc)` (pure) |
| Representative median per role | median of `p50` across the role's metros |
| Labels | `meta.roles` (`label`/`short`), `fmtUsd` |

`similarByPay` returns the other roles sorted by `overlap` desc (thin pairs after), each with
`{ soc, label, overlap, ratio, shared, repMedian }`.

## UI

- **Header**: "Which roles pay like this one?" + caption naming the anchor role and noting the
  measure is a cross-metro pay ratio (COL-invariant).
- **List**: one row per other role, ranked — role name (clickable), an overlap bar + "typically
  within X%", the two representative medians, and a "thin overlap (N metros)" chip when applicable.
  The closest-paid role is first.
- **Empty/degenerate**: a role with too few metros to compare anything → "Not enough overlap to
  compare this role."

## Error handling

| Condition | Handling |
|---|---|
| A role suppressed in a metro | that metro drops from the shared set for pairs involving it |
| Pair shares < `MIN_SHARED` metros | included, sorted after well-supported pairs, "thin overlap" chip |
| Anchor role has < 2 metros / no comparable pairs | section-level "not enough overlap" note |
| Ratio direction | show "≈ same", "pays ~N% more/less" from the median ratio |

## Testing

- Unit (`site/tests/role-similarity.test.ts`): overlap = 1 for identical vectors; correct value for
  a known 10%-gap pair; excludes the anchor role; shared-metro count and `thin` flag at the
  threshold; ranking order (closest first, thin demoted); COL-invariance (adjusted input yields the
  same ranking).
- Component (`site/tests/role-similarity.test.tsx`): ranked rows for the anchor role, closest first;
  a clickable role fires `onSelectRole`; thin chip renders; empty-state note for a starved anchor.
- e2e (extend `site/e2e`): section renders for the default role and lists ranked roles; clicking
  one changes the active role. (Run the FULL e2e suite.)

## Out of scope

- Correlation/co-movement similarity; a full role×role matrix or dendrogram; k-means/hierarchical
  cluster groupings.
- Variants 2–3 (H-1B title-normalization matrix, O*NET) and any pipeline/emit change.
