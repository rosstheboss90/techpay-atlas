# Project Standards — what transfers between projects

A portable house standard, distilled from comparing this repo against the sibling projects in
`Claude-Projects`. It answers one question: when starting or aligning a project, **what should
be copied over, and what must not be.**

The rule of thumb: **conventions transfer; content does not.** How you document, test, gate, and
ship is shared across every project. What a project actually *is* — its endpoints, models,
domain rules, secrets — is unique and copying it into another project is an anti-pattern.

## Transfer classification

| Category | Transfer? | Why |
|---|---|---|
| `CLAUDE.md` **structure** (the section skeleton) | ✅ Adopt | Same outline everywhere; fill with each project's own facts |
| Design-doc templates (spec + plan) | ✅ Adopt | Identical shape across projects (see below) |
| CI baseline — gate PRs on typecheck + tests + build | ✅ Adopt | Same intent; swap the commands for the stack |
| Git flow — branch → PR → merge, conventional commits | ✅ Adopt | Stack-independent |
| Backlog doc — decisions newest-first | ✅ Adopt | Stack-independent |
| Engineering habits — tests-first, additive changes, explicit out-of-scope, fail-loud validation, label-don't-hide uncertainty | ✅ Adopt | Principles, not code |
| `CLAUDE.md` **content** — endpoints, models, field IDs, architecture tables | ❌ Rewrite | Project-specific; copying misdescribes the new project |
| Env vars / credential lists / API-key wiring | ❌ Rewrite | Per-project, often secret |
| Ports, hostnames, external service IDs | ❌ Rewrite | Each project owns its own; just document them |
| Stack tooling (FastAPI vs Next, pytest vs vitest) | ❌ Rewrite | Adapt the convention to the stack, don't copy the tool |

## The transferable pieces

### 1. `CLAUDE.md` skeleton

Every project's root `CLAUDE.md` uses the same sections, in this order. Only the content changes.

```
# CLAUDE.md — guidance for Claude Code in this repo
## Project            — one-paragraph what-and-why + live URL
## Commands           — copy-pasteable setup/run/test, per package
## Architecture       — file/dir responsibility tables
## Data               — sources, flow, refresh steps (if data-backed)
## Development practices — tests, validation, invariants, conventions
## Workflow           — design-before-code, branch→PR→deploy
### Design-doc house style — the spec/plan templates below
```

### 2. Design-doc templates (`docs/superpowers/`)

- **Spec** (`specs/YYYY-MM-DD-<feature>-design.md`): header line with **Date** + **Status**
  (`Draft for review` → `Approved`), then **Purpose** → **Decisions** (chosen, and why) →
  **Architecture** → **Data / joins** → **UI** → **Error handling** → **Testing** →
  **Out of scope**. Edge cases and error handling go in tables. Always state what's *not* in scope.
- **Plan** (`plans/YYYY-MM-DD-<feature>.md`): one-line **Goal** → **File Map** → numbered
  **Tasks** ordered *tests-first* (a test/fixture task precedes the implementation it covers) →
  **Done criteria** / final test-run-and-push task. Prefer additive changes and say so.

### 3. CI baseline

Every project gates PRs with a `pull_request`-triggered workflow that runs, at minimum,
**typecheck + unit tests + a build**. Deploy stays a separate, merge-triggered workflow — CI
proves correctness, deploy ships. Swap the commands per stack (`vitest`/`tsc`/`next build` here;
`pytest`/`ruff` for the Python projects) but keep the gate.

### 4. Git & commit conventions

- Develop on a feature branch; open a PR against the default branch; merge triggers deploy.
- Conventional-commit prefixes: `feat` / `fix` / `data` / `docs` / `test` / `chore`.
- PR body: what changed, why, how it was tested; note anything out of scope.

### 5. Engineering habits

- **Tests-first**, and run them before every commit.
- **Additive by default** — "purely additive, existing X unchanged" beats a rewrite.
- **Explicit out-of-scope** in every spec.
- **Fail loud, not silent** — validate inputs against documented thresholds/tripwires; a bad
  run should stop, not emit quietly-wrong output.
- **Label uncertainty, don't hide it** — small samples, suppressed cells, midpointed ranges get
  a visible marker, never silent omission. (Applies wherever a project surfaces data to users.)

## What NOT to transfer

Copying any of these into another project makes its docs lie about what it is:

- Architecture / endpoint / model tables, and any domain logic description.
- Env-var and credential lists; API-key setup.
- Ports, hostnames, external IDs (custom-field IDs, board IDs, account IDs).
- Stack-coupled commands and tool config — adopt the *convention*, re-derive the *command*.

## Adoption checklist (new or existing project)

- [ ] Root `CLAUDE.md` built from the skeleton, filled with this project's real facts
- [ ] `pull_request` CI workflow gating typecheck + tests + build
- [ ] `docs/superpowers/` spec + plan for the next non-trivial feature
- [ ] Conventional commits + branch → PR → merge flow
- [ ] A backlog doc, decisions newest-first
- [ ] Ports / env / external IDs documented (not copied from a sibling)
