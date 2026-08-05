// Collapse a free-text H-1B JOB_TITLE to a canonical form by stripping RANK, not ROLE — so title
// variants that describe the same job merge before we count their SOC scatter. Heuristic and
// deliberately conservative; role-defining words (MANAGER, DIRECTOR, VP, HEAD, ARCHITECT, ENGINEER,
// SCIENTIST, ANALYST, …) are kept. Titles arrive already UPPERCASE + whitespace-collapsed from
// parse-lca. Known rough edges: "LEAD"/"ASSOCIATE" are treated as rank (so "TECH LEAD" → "TECH"),
// and a bare trailing number is dropped as a level — tune here after eyeballing real output.

const NOISE = /[.,/;:()[\]{}"'’]/g

// Seniority / IC-level words that describe rank rather than the kind of job.
const SENIORITY = /\b(SENIOR|SR|JR|JUNIOR|STAFF|PRINCIPAL|DISTINGUISHED|ASSOCIATE|LEAD|ENTRY[\s-]?LEVEL|MID[\s-]?LEVEL|EXPERIENCED)\b/g

// A trailing level/grade token: roman numeral, L4 / LEVEL 3 / GRADE 2, or a bare trailing number.
const LEVEL_SUFFIX = /\b(?:I{1,3}|IV|VI?|L\d+|LEVEL\s*\d+|GRADE\s*\d+|\d+)\s*$/

/** Canonical, rank-stripped title. Returns '' when nothing meaningful survives. */
export function normalizeTitle(raw: string): string {
  let t = raw.toUpperCase()
  t = t.replace(/\([^)]*\)/g, ' ')   // drop parentheticals wholesale
  t = t.replace(NOISE, ' ')
  t = t.replace(SENIORITY, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  // Peel trailing level/grade tokens, up to a few (e.g. "ENGINEER II L4" -> "ENGINEER").
  for (let i = 0; i < 3; i++) {
    const next = t.replace(LEVEL_SUFFIX, '').trim()
    if (next === t) break
    t = next
  }
  return t.replace(/\s+/g, ' ').trim()
}
