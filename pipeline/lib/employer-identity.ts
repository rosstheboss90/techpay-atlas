/** Legal-entity suffixes stripped from the tail of a filed employer name. Deliberately excludes
 *  words like GROUP or HOLDINGS: those distinguish real entities, while these do not. */
const LEGAL_SUFFIXES = new Set([
  'INC', 'INCORPORATED', 'LLC', 'PLLC', 'LLP', 'LP', 'CORP', 'CORPORATION',
  'LTD', 'LIMITED', 'PC', 'CO', 'USA', 'US',
])

/** Filed name -> comparison key: uppercase, punctuation removed, whitespace collapsed, trailing
 *  legal suffixes stripped. Stacked suffixes ("US LLP") strip in one pass, tail-first. */
export function baseKey(name: string): string {
  const cleaned = String(name ?? '')
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const tokens = cleaned.split(' ').filter(Boolean)
  // Never strip down to nothing: a name that IS a suffix keeps it.
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop()
  return tokens.join(' ')
}

/** Canonical key -> URL slug. Non-alphanumerics become single hyphens. */
export function slugify(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface AliasEntity {
  canonical: string
  display: string
  category: 'staffing' | 'direct'
  match: string[]
}
export interface AliasFile { version: number; entities: AliasEntity[] }

export interface CanonicalEmployer {
  /** Grouping key: the alias canonical id when aliased, else the deterministic base key. */
  key: string
  display: string
  slug: string
  category: 'staffing' | 'direct'
  /** False when the deterministic fallback produced this. The site must not render an
   *  unaliased `direct` as a badge — it is a default, not a reviewed claim. */
  aliased: boolean
}

/** Build a base-key -> entity lookup once, rather than scanning `entities` per record. */
export function indexAliases(file: AliasFile): Map<string, AliasEntity> {
  const out = new Map<string, AliasEntity>()
  for (const e of file.entities) for (const m of e.match) out.set(m, e)
  return out
}

export function canonicalEmployer(
  name: string,
  aliases: AliasFile | Map<string, AliasEntity>,
): CanonicalEmployer {
  const index = aliases instanceof Map ? aliases : indexAliases(aliases)
  const base = baseKey(name)
  const hit = index.get(base)
  if (hit) {
    return {
      key: hit.canonical, display: hit.display, slug: slugify(hit.canonical),
      category: hit.category, aliased: true,
    }
  }
  return { key: base, display: name.trim(), slug: slugify(base), category: 'direct', aliased: false }
}
