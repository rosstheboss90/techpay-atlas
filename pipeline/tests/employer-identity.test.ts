import { describe, expect, it } from 'vitest'
import { baseKey, slugify } from '../lib/employer-identity'

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
