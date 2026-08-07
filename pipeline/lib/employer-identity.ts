/** Legal-entity suffixes stripped from the tail of a filed employer name. Deliberately excludes
 *  words like GROUP or HOLDINGS: those distinguish real entities, while these do not. */
const LEGAL_SUFFIXES = new Set([
  'INC', 'INCORPORATED', 'LLC', 'PLLC', 'LLP', 'LP', 'CORP', 'CORPORATION',
  'LTD', 'LIMITED', 'PC', 'CO', 'USA', 'US',
])

/** Filed name -> comparison key: uppercase, punctuation normalized, whitespace collapsed,
 *  trailing legal suffixes stripped. Stacked suffixes ("US LLP") strip in one pass, tail-first.
 *
 *  Punctuation is handled in two deliberately different ways:
 *
 *  - `.` `,` `'` are DELETED, because they sit inside a token without separating it:
 *    "Amazon.com" is one word, and "U.S." must become "US" so it strips as a legal suffix.
 *  - every OTHER non-alphanumeric run becomes a single SPACE, because it separates words.
 *
 *  The second rule exists to keep this key space at least as coarse as slugify()'s. Deleting
 *  only `.`/`,` left hyphens and ampersands in the key while slugify collapsed them, so two
 *  distinct keys could produce one slug — real filings include both "CIGNA- EVERNORTH SERVICES"
 *  and "CIGNA-EVERNORTH SERVICES", one company filed two ways. With this rule the key contains
 *  only [A-Z0-9] and single spaces, so slugify is injective over keys and a slug collision is
 *  structurally impossible rather than merely detected. run.ts still asserts it, as a guard
 *  against a future change to either function reintroducing the gap. */
export function baseKey(name: string): string {
  const cleaned = String(name ?? '')
    .toUpperCase()
    .replace(/['’.,]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
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

/** Build a base-key -> entity lookup once, rather than scanning `entities` per record.
 *
 *  Each entity also implicitly claims `baseKey(canonical)` — the key a bare filing under its own
 *  name produces. Without this, an aliased employer's key is its lowercase canonical id while an
 *  unaliased one's is an uppercase base key, and the two namespaces collide under slugify: real
 *  data contains "Deloitte Consulting LLP" (aliased -> `deloitte`) alongside a bare "Deloitte"
 *  (unaliased -> `DELOITTE`), both slugging to "deloitte". Every alias id had this latent — a
 *  bare "Amazon", "Meta", "TCS" or "EY" filing would each have hit it.
 *
 *  `baseKey(canonical)` is exactly the colliding key and no other: a slug collision requires the
 *  two keys to differ only in case and separator style, and both sides are normalized by the same
 *  function, so they must be equal. Claiming it is therefore complete, not a patch — and it is
 *  also the semantically right answer, since a filing under the bare canonical name IS that
 *  company. An explicit `match` entry always wins over the implicit claim. */
export function indexAliases(file: AliasFile): Map<string, AliasEntity> {
  const out = new Map<string, AliasEntity>()
  for (const e of file.entities) {
    const implicit = baseKey(e.canonical)
    if (implicit && !out.has(implicit)) out.set(implicit, e)
  }
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
