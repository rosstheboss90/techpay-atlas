# Employer Lens — Design Spec

**Date:** 2026-08-06 · **Status:** Draft for review

## Purpose

The site can answer "what does this role pay in this city". It cannot answer "what does **this
employer** file, across roles and across cities" — the question a reader actually brings when they
have an interview next week.

The LCA data to answer it is already ingested. `pipeline/lib/parse-lca.ts` normalizes employer,
SOC, worksite ZIP and annualized wage for all four FY2025 quarters, and
`site/public/data/employers/` holds 371 per-CBSA files. But that data is laid out **metro-major**
(`cbsa → soc → employers[]`), which is the transpose of what an employer view needs, and it is
truncated to the top 15 employers per (metro, role). The employer lens is therefore a pipeline
change, not a UI layer over existing output.

## Decisions

1. **Employer identity is deterministic-base plus curated-head.** (Option C of three considered.)
   A suffix-stripping rule handles the long tail; a committed alias file handles the few hundred
   filers where fragmentation actually distorts the headline number.

   Measured from the *already-truncated* emitted data: 20,928 employer rows collapse to 8,003
   distinct display strings, and Amazon alone appears as six —

   ```
   Amazon Advertising LLC            Amazon Web Services, Inc.
   Amazon Data Services, Inc         Amazon.com Services LLC
   AMAZON DATA SERVICES, INC.        Amazon Development Center U.S., Inc.
   ```

   Suffix-stripping alone (Option B) merges `Google LLC` with `Google Inc` but leaves Amazon as
   five or six companies, because Amazon's fragmentation is in the *second word*. Exact-key
   (Option A, today's behaviour) leaves the lens least reliable for precisely the employers a
   reader looks up first.

2. **Display names are resolved globally, not per bundle.** Rows 2 and 3 above are the same legal
   entity differing only by case and a period. `employerKey` (`pipeline/lib/aggregate.ts:33`)
   *does* normalize them to one key — but the merge runs per (cbsa, soc) bundle and each bundle
   independently keeps its own most-common casing, so one entity surfaces under different strings
   in different metros. A national rollup keyed on the emitted *display* name would double-count.

3. **Profiles are aggregated from `employerRecords`, never from the emitted files.**
   `aggregateEmployers` truncates at `topN = 15` per (cbsa, soc). An employer ranked 16th in a
   metro is simply absent there, so a rollup over the 371 files would silently undercount national
   totals — worst for mid-size employers spread thin across many metros. Rebuilding from
   `run.ts:134`'s `employerRecords` avoids this entirely.

4. **Scope inherits the target-SOC filter.** `run.ts:134` filters to the 21-role registry before
   the employer layer. The lens inherits that, matching today's employer files. Off-registry SOCs
   are out of scope, not silently partial.

5. **Prerender the head, search the tail.** (Option A of three considered.) Static pages for
   filers clearing a floor; everyone else reachable via client-side search rendering inline.
   Measured distribution, again from truncated data so every count is a floor:

   | Floor | Employers |
   |---|---|
   | ≥ 500 filings | 45 |
   | ≥ 100 | 156 |
   | ≥ 50 | 259 |
   | ≥ 25 | **434** ← chosen floor |
   | ≥ 10 | 962 |
   | ≥ 5 | 1,715 |
   | ≥ 1 | 7,826+ (true tail is several times larger) |

   Prerendering everything is 8,000+ pages minimum, most of them single-filing pages whose own
   caption would say they mean nothing.

6. **Staffing firms are labelled and filterable, never removed or left unmarked.** Ranked by
   filing volume the head is dominated by staffing and outsourcing firms — Cognizant #2, TCS #5,
   Infosys #7, with EY and Deloitte close behind — whose filed wages run systematically lower.
   A default ranking without this reads as a "top tech employers" list and is actively misleading;
   silently dropping them would be its own distortion. The alias file carries a
   `category: 'staffing' | 'direct'`, the page shows a chip, and ranked lists offer an exclude
   toggle that defaults to off.

   **Employers absent from the alias file are `direct` by default, and the default is never
   displayed as a claim.** The chip renders only for an explicit `staffing`; an unaliased employer
   shows no category chip at all, rather than an unearned "direct" badge. This keeps the curated
   file an assertion about the head — where it has been reviewed — instead of an implicit
   assertion about a tail nobody has looked at. The exclude toggle therefore removes only
   *known* staffing firms, which is a filter the page should describe in those words.

7. **Filed wages are not top-coded and must never be treated as such.** LCA wages are actual filed
   values bounded only by the `WAGE_MIN`/`WAGE_MAX` sanity range (`parse-lca.ts:15`). The OEWS
   top-code machinery — including the new vintage-keyed `makeCell(topCode)` factory — has no
   business touching employer data. Stated explicitly because both live in the same pipeline.

## Architecture

| File | Change |
|---|---|
| `pipeline/lib/employer-identity.ts` | **New.** `canonicalEmployer(name) → { key, display, slug }`; suffix rules + alias overlay. |
| `data/employer-aliases.json` | **New, committed.** Variant key → `{ canonical, display, category }`. |
| `pipeline/lib/aggregate-employer-profiles.ts` | **New.** `employerRecords → Map<key, EmployerProfile>`. Pure. |
| `pipeline/lib/emit.ts` | Add `buildEmployerHead`, `buildEmployerIndex`, `buildEmployerProfiles`. |
| `pipeline/config.ts` | Add `minEmployerProfiles`, `maxAliasCollapse`, `employerPrerenderFloor`. |
| `pipeline/run.ts` | Aggregate profiles in the existing employer phase; emit the three new artifacts. |
| `site/app/employers/page.tsx` | **New.** Index + search. |
| `site/app/employers/[slug]/page.tsx` | **New.** `generateStaticParams()` over the profile directory. |
| `site/lib/employer.ts` | **New.** Types + base-path-aware fetch helpers. |
| `site/components/EmployerSearch.tsx` | **New.** Prefix search over head + lazily-fetched shards. |
| `site/components/EmployerProfile.tsx` | **New.** Header, entity disclosure, disclaimers. |
| `site/components/EmployerRoleTable.tsx` | **New.** Role × metro table. |
| `site/components/SectionNav.tsx` | Nav link to `/employers`. |

`aggregate-employer-profiles.ts` is pure and takes the record array, mirroring `build-trends.ts` in
the `/trends` spec — testable without I/O, and reusable if LCA multi-year ever lands.

## Data contracts

**`site/public/data/employer-head.json`** — the ~434 prerendered filers, loaded eagerly by
`/employers`. Carries `lcaPeriod` provenance, matching `titles.json` and `conflation.json`
(`buildTitles(titleAgg, lcaPeriod)`, `buildConflation(conflationAgg, lcaPeriod)`).

```json
{
  "lcaPeriod": "FY2025 Q1–Q4",
  "employers": [
    { "slug": "amazon", "display": "Amazon", "filings": 0, "category": "direct", "topRole": "15-1252" }
  ]
}
```

**`site/public/data/employer-index/{a-z,0-9,_}.json`** — every filer, sharded by first character
of the slug, fetched on first keystroke. Compact positional arrays; `_` collects anything
non-alphanumeric. Each entry carries enough to render a tail result inline without a second fetch:

```json
{ "k": ["slug", "display", "filings", "category", "topRole", "topCbsa", "median"],
  "v": [["acme-dental", "Acme Dental Partners", 1, "direct", "15-1252", "46140", 92000]] }
```

**`site/public/data/employers-by-name/{slug}.json`** — prerendered filers only, ~434 files:

```json
{
  "slug": "amazon",
  "display": "Amazon",
  "category": "direct",
  "lcaPeriod": "FY2025 Q1–Q4",
  "totalFilings": 0,
  "entities": [{ "name": "Amazon.com Services LLC", "filings": 0 }],
  "roles": {
    "15-1252": {
      "national": { "filings": 0, "p25": 0, "median": 0, "p75": 0 },
      "metros": [{ "cbsa": "42660", "filings": 0, "median": 0 }]
    }
  }
}
```

*(Zeros are shape, not data.)* Tail employers get no profile file and no page — their search hit
renders from the index shard. This is what holds the file count at ~470 rather than tens of
thousands.

## Site

`/employers` — search box over head + shards, a ranked head list with the staffing toggle, and the
standing disclaimers. `/employers/[slug]` — profile header with total filings and an expandable
"includes N filing entities" disclosure, then the role × metro table.

Fetches use the existing `NEXT_PUBLIC_BASE_PATH` prefixing pattern in `site/lib/data.ts`. Per the
editorial polish house rule, no fixed px for label columns or table canvases — size to content in
`ch` and let the table claim the container.

**Honesty furniture**, per `PROJECT-STANDARDS.md`'s "label uncertainty, don't hide it":

| Risk | Treatment |
|---|---|
| Reader takes filed wage as total comp | "Filed base-pay floor — no equity, no bonus" on every page, not a footnote |
| Reader takes the data as market-wide | "H-1B sponsors only" stated alongside |
| Reader takes volume ranking as a quality ranking | Staffing chip + exclude toggle (Decision 6) |
| Reader trusts a thin cell | Thin-sample chip, reusing the existing `THIN_SAMPLE_FILINGS` convention |
| Reader assumes the entity merge is authoritative | Expandable entity list makes every merge auditable |

## Error handling and tripwires

In the existing `fail()` idiom — a bad run stops rather than emitting quietly-wrong output.

| Tripwire | Fires when | Why |
|---|---|---|
| `minEmployerProfiles: 200` | fewer filers clear the floor | normalization or the SOC filter broke |
| `maxAliasCollapse: 0.25` | alias merging absorbs >25% of all filings | an over-broad alias rule |
| stale-alias check | any alias entry matches zero filed names | prevents the alias file rotting silently as vintages change |
| slug uniqueness | two canonical employers produce one slug | would otherwise overwrite a profile file |

**Stale-output deletion follows the existing rule at `run.ts:195–198`**: `employers-by-name/` and
`employer-index/` are removed and recreated *only after every assertion has passed*, exactly as
`employers/` is today. Without this a slug that disappears between vintages keeps its page forever.
This matters more here than for `employers/`, because these files back prerendered routes —
`generateStaticParams()` reads the directory, so a stale file becomes a stale published URL.

## Testing

**Pipeline (vitest, alongside `pipeline/tests/`):**

- `canonicalEmployer` against the six real Amazon variants and both Google variants as fixtures,
  plus suffix cases (`INC`/`LLC`/`LIMITED`/`LLP`) and punctuation-only differences.
- Alias-file integrity: every entry well-formed, every entry matched, no duplicate canonical slugs.
- National filings equal the sum of per-metro filings for every profile.
- **A regression test pinning that profiles are built from records, not emitted files** — construct
  a fixture where an employer ranks 16th in one metro and assert its national total still counts
  those filings. This is Decision 3's failure mode and it is silent without a test.
- Global display-name resolution: two casings of one entity in different bundles yield one profile.

**Site:** a profile fixture driving `site/lib/employer.ts` — role ordering, thin-sample marking,
staffing filter, slug round-trip.

**E2E:** index renders and searches; a prerendered profile renders; a tail employer renders inline
from the shard without a profile fetch; the entity disclosure expands.

## Interaction with the data-refresh / `/trends` work

Ref: `docs/superpowers/specs/2026-08-06-trends-and-data-refresh-design.md`, implemented on
`feat/data-refresh-and-archive` (15 commits, §1 data layer only; `/trends` Phase A not started).

### What does not collide

The landed branch touches `download.ts`, `lib/download-lib.ts`, `lib/history.ts`, `lib/num.ts`,
`lib/parse-oews.ts`, `vintages.ts`, `archive-verify.ts` and their tests. It does **not** touch
`run.ts`, `emit.ts`, `aggregate.ts`, `config.ts`, or `SectionNav.tsx`. Nothing in this spec reads
or writes OEWS vintages, `data/history/`, the CPI deflator, or the top-code table. The two data
paths are genuinely disjoint: `/trends` is OEWS-national-longitudinal, this is
LCA-cross-sectional-by-employer.

### Real dependencies

| # | Interaction | Resolution |
|---|---|---|
| D1 | **`trailingSlash` is unset**, so the export emits `employers.html` and `/employers/` 404s — the defect `/about` has and `/trends` will inherit. | **Elevated to a prerequisite for this work.** The backlog defers it to the custom-domain move because it changes every URL; that was a reasonable call for two routes. This spec adds ~435 URLs whose entire point is being linkable and indexable, and a shared link with a trailing slash dead-ends. Land `trailingSlash: true` **before** the employer lens ships, together with the custom-domain move if that is close, standalone if not. |
| D2 | **`run.ts` emit phase** — `/trends` Phase A adds `trends.json`; this adds three artifacts. Both are additive in the same region of the file. | Whichever lands second rebases. Low risk, but do not run them concurrently in the same working tree. |
| D3 | **`SectionNav.tsx`** — both add a nav link. The site goes from 2 routes to 4. | Textual conflict is trivial; the design question is not. A masthead carrying one link is not a site nav carrying four. Whoever lands second should reassess the nav as a whole rather than appending a third `<a>`. |
| D4 | **`pipeline/config.ts` `THRESHOLDS`** — both add keys. | Additive, trivial. |
| D5 | **`run.ts` heap.** `run.ts` already needs `--max-old-space-size=6144` and holds the full `matched` array (500k+ rows). Employer profiles add a second nested Map over the same records. | Build profiles in the **existing employer phase**, reusing the traversal that `aggregateEmployers` already makes, rather than adding an independent pass. If headroom is still short, the profile aggregation is pure and can move to its own entry point exactly as `archive-nat.ts` did — and for the same stated reason. |
| D6 | **`npm test` used to download ~500 MB** because `download.test.ts` imported a module whose loop ran at import. Fixed on the branch by splitting `download-lib.ts` out of `download.ts`. | This spec adds no new entry-point script, so the hazard does not recur — but if D5 forces one, it must follow the `download-lib.ts` split pattern, not the old shape. |
| D7 | **Deploy is ungated** (`deploy.yml` runs no tests; `ci.yml` gates PRs only), per Decision 7 of the trends spec. | Same conclusion: this lands as a PR. Never push `main` directly. |

### Sequencing

The refresh work's §1 should land first, and not because this depends on it — it does not. Its own
spec notes it is worth landing before the next data refresh regardless, since a vintage overwritten
without being archived can only be recovered by re-downloading it. It is also already implemented
and reported near-complete as of 2026-08-06, whereas this is unstarted. Rebasing an unwritten
feature onto a landed data layer is free; the reverse is not.

The one caveat on "near-complete": the backfill itself was blocked on an Akamai 403, and the trends
spec flags three things it wants **measured against the real files rather than assumed** — the
national parser's column shape, the top-code boundary year, and each young role's first-appearance
year. Those are open questions inside that work, not blockers on this one, but they mean "§1 has
landed" and "the archive is populated and verified" are different milestones. Only the first
gates a rebase here.

`/trends` Phase A and the employer lens are then genuinely parallel — different sources, different
pages, different failure modes — subject to D2 and D3.

### Forward compatibility with LCA multi-year

The backlog's **"H-1B multi-year ingest (LCA FY2020–FY2024)"** row is the natural successor to this
work and would give employer profiles a time dimension. Two cheap accommodations now:

- Every emitted artifact carries `lcaPeriod`, so a future multi-year artifact is distinguishable
  from a single-vintage one rather than ambiguous.
- `aggregate-employer-profiles.ts` is pure and takes a record collection, so a year dimension is an
  added key rather than a rewrite — the same property the trends spec gives `build-trends.ts`.

Note the naming distinction that spec calls out: **OEWS** real-wage trends and **H-1B** multi-year
ingest are different projects. This spec means LCA wherever it says multi-year.

## Out of scope

- **PERM ingest.** Different population and different wage semantics; its own spec.
- **LCA multi-year (FY2020–FY2024).** Forward-compatibility only, above.
- **Employer-vs-employer comparison.** The existing head-to-head component compares metros; an
  employer version is a separate design.
- **Roles outside the 21-role registry** (Decision 4).
- **Logos, company metadata, or any non-DOL data source.**
- **`trailingSlash`** — a prerequisite (D1), not a deliverable of this spec.
- **Phase B metro trends, `/trends` itself, and the vintage chip** — all owned by the trends spec.
