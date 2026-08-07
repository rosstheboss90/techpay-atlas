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
    expect(baseKey('Ernst & Young US LLP')).toBe('ERNST & YOUNG')
    expect(baseKey('Tata Consultancy Services Limited')).toBe('TATA CONSULTANCY SERVICES')
  })

  it('never strips a suffix that is the entire name', () => {
    expect(baseKey('LLC')).toBe('LLC')
  })

  it('leaves distinct second words distinct — suffix stripping alone does not merge Amazon', () => {
    expect(baseKey('Amazon Web Services, Inc.')).not.toBe(baseKey('Amazon.com Services LLC'))
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
