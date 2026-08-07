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
