import { describe, expect, it } from 'vitest'
import { baseKey, canonicalEmployer, slugify, type AliasFile } from '../lib/employer-identity'

describe('baseKey', () => {
  it('uppercases, strips punctuation, collapses whitespace', () => {
    expect(baseKey('Amazon.com Services LLC')).toBe('AMAZONCOM SERVICES')
    expect(baseKey('  Acme   Corp  ')).toBe('ACME')
  })

  it('merges the two casings of one entity that differ only by case and a period', () => {
    expect(baseKey('Amazon Data Services, Inc')).toBe(baseKey('AMAZON DATA SERVICES, INC.'))
  })

  it('strips legal suffixes, including stacked ones', () => {
    expect(baseKey('Google LLC')).toBe('GOOGLE')
    expect(baseKey('Google Inc')).toBe('GOOGLE')
    expect(baseKey('Ernst & Young US LLP')).toBe('ERNST YOUNG')
    expect(baseKey('Tata Consultancy Services Limited')).toBe('TATA CONSULTANCY SERVICES')
  })

  it('never strips a suffix that is the entire name', () => {
    expect(baseKey('LLC')).toBe('LLC')
  })

  it('leaves distinct second words distinct — suffix stripping alone does not merge Amazon', () => {
    expect(baseKey('Amazon Web Services, Inc.')).not.toBe(baseKey('Amazon.com Services LLC'))
  })

  it('deletes intra-word punctuation but treats other punctuation as a separator', () => {
    // '.' is deleted so "Amazon.com" stays one token and "U.S." strips as a legal suffix...
    expect(baseKey('Amazon.com Services LLC')).toBe('AMAZONCOM SERVICES')
    expect(baseKey('Amazon Development Center U.S., Inc.')).toBe('AMAZON DEVELOPMENT CENTER')
    // ...while '-' and '&' separate words, so spacing around them cannot change the key.
    expect(baseKey('Wal-Mart Associates, Inc')).toBe('WAL MART ASSOCIATES')
  })

  it('merges one company filed with and without a space after a hyphen', () => {
    // Both spellings appear in the real FY2025 LCA data and previously produced two employers
    // whose slugs collided, failing the pipeline.
    expect(baseKey('CIGNA- EVERNORTH SERVICES')).toBe(baseKey('CIGNA-EVERNORTH SERVICES'))
    expect(baseKey('CIGNA- EVERNORTH SERVICES')).toBe('CIGNA EVERNORTH SERVICES')
  })
})

describe('baseKey -> slugify is injective', () => {
  it('produces keys containing only A-Z, 0-9 and single spaces', () => {
    for (const name of [
      'Ernst & Young US LLP', 'Wal-Mart Associates, Inc', "O'Reilly Media, Inc.",
      'CIGNA- EVERNORTH SERVICES', 'AT&T Services, Inc.', '3M Company', 'Amazon.com Services LLC',
    ]) {
      expect(baseKey(name)).toMatch(/^[A-Z0-9]+( [A-Z0-9]+)*$/)
    }
  })

  it('never maps two distinct keys onto one slug', () => {
    // This property is what makes run.ts's slug-collision tripwire structurally unreachable
    // rather than merely unobserved. Keep the tripwire anyway: it guards against a future
    // change to either function reintroducing the gap.
    const names = [
      'A & B', 'A&B', 'A-B', 'A - B', 'CIGNA- EVERNORTH SERVICES', 'CIGNA-EVERNORTH SERVICES',
      'Wal-Mart Associates', 'Wal Mart Associates', 'Amazon.com Services', 'Amazon com Services',
    ]
    const bySlug = new Map<string, Set<string>>()
    for (const n of names) {
      const key = baseKey(n)
      const slug = slugify(key)
      if (!bySlug.has(slug)) bySlug.set(slug, new Set())
      bySlug.get(slug)!.add(key)
    }
    for (const [slug, keys] of bySlug) {
      expect(`${slug} -> ${[...keys].join(' | ')}`).toBe(`${slug} -> ${[...keys][0]}`)
    }
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('ERNST & YOUNG')).toBe('ernst-young')
    expect(slugify('AMAZONCOM SERVICES')).toBe('amazoncom-services')
  })
  it('collapses and trims separators', () => {
    expect(slugify('  A -- B  ')).toBe('a-b')
  })
})

const aliases: AliasFile = {
  version: 1,
  entities: [
    {
      canonical: 'amazon', display: 'Amazon', category: 'direct',
      match: ['AMAZONCOM SERVICES', 'AMAZON WEB SERVICES', 'AMAZON DATA SERVICES'],
    },
    {
      canonical: 'cognizant', display: 'Cognizant', category: 'staffing',
      match: ['COGNIZANT TECHNOLOGY SOLUTIONS'],
    },
  ],
}

describe('canonicalEmployer', () => {
  it('merges aliased variants into one canonical entity', () => {
    const a = canonicalEmployer('Amazon.com Services LLC', aliases)
    const b = canonicalEmployer('Amazon Web Services, Inc.', aliases)
    expect(a.key).toBe('amazon')
    expect(b.key).toBe('amazon')
    expect(a.display).toBe('Amazon')
    expect(a.slug).toBe('amazon')
  })

  it('carries the curated category', () => {
    expect(canonicalEmployer('Cognizant Technology Solutions US Corp', aliases).category)
      .toBe('staffing')
  })

  it('falls back to the deterministic rule for unaliased filers', () => {
    const r = canonicalEmployer('Sheetz, Inc.', aliases)
    expect(r.key).toBe('SHEETZ')
    expect(r.slug).toBe('sheetz')
    expect(r.display).toBe('Sheetz, Inc.')
  })

  it('defaults unaliased filers to direct, which the site must not render as a claim', () => {
    expect(canonicalEmployer('Sheetz, Inc.', aliases).category).toBe('direct')
    expect(canonicalEmployer('Sheetz, Inc.', aliases).aliased).toBe(false)
  })
})
