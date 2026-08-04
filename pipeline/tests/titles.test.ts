import { describe, expect, it } from 'vitest'
import { FAMILIES, bucketFor, parseSeniority } from '../lib/titles'

const cases: [string, string | null][] = [
  ['SENIOR TECHNICAL PROGRAM MANAGER II', 'tpm'],
  ['TECHNICAL PROJECT MANAGER', 'techProjectMgr'],
  ['TECHNICAL PRODUCT MANAGER - PAYMENTS', 'techProductMgr'],
  ['PRODUCT OWNER', 'productOwner'],
  ['SENIOR PRODUCT MANAGER', 'productMgr'],
  ['PROGRAM MANAGER III', 'programMgr'],
  ['PROJECT MANAGER', 'projectMgr'],
  ['PMO LEAD', 'pmo'],
  ['DEVOPS ENGINEER', 'devops'],
  ['DEV OPS ENGINEER', 'devops'],
  ['SITE RELIABILITY ENGINEER', 'sre'],
  ['SR SRE', 'sre'],
  ['PLATFORM ENGINEER', 'platformEng'],
  ['CLOUD ENGINEER', 'cloudEng'],
  ['INFRASTRUCTURE ENGINEER', 'infraEng'],
  ['DATA ENGINEER', 'dataEng'],
  ['SENIOR MACHINE LEARNING ENGINEER', 'mlEng'],
  ['ML ENGINEER', 'mlEng'],
  ['ANALYTICS ENGINEER', 'analyticsEng'],
  ['DATA ANALYST', 'dataAnalyst'],
  ['FRONT END DEVELOPER', 'frontend'],
  ['FRONT-END ENGINEER', 'frontend'],
  ['BACKEND DEVELOPER', 'backend'],
  ['FULL STACK DEVELOPER', 'fullstack'],
  ['FULLSTACK ENGINEER', 'fullstack'],
  ['IOS DEVELOPER', 'mobile'],
  ['ANDROID ENGINEER', 'mobile'],
  ['MOBILE SOFTWARE ENGINEER', 'mobile'],
  ['SOFTWARE ENGINEER', null],          // no bucket — plain SWE is not a lens title
  ['SR. SDET', null],
  ['MARKETING MANAGER', null],
]

describe('bucketFor', () => {
  it.each(cases)('%s -> %s', (title, key) => {
    expect(bucketFor(title)?.key ?? null).toBe(key)
  })
  it('technical variants win over generic (ordering)', () => {
    expect(bucketFor('TECHNICAL PROGRAM MANAGER')!.key).toBe('tpm')
    expect(bucketFor('PROGRAM MANAGER, TECHNICAL PROGRAMS')!.key).toBe('tpm')
  })
  it('no title matches buckets in two different families', () => {
    for (const [title] of cases) {
      const hits = FAMILIES.filter(f => f.buckets.some(b => b.re.test(title)))
      expect(hits.length, title).toBeLessThanOrEqual(1)
    }
  })
})

describe('parseSeniority', () => {
  it.each([
    ['SENIOR TECHNICAL PROGRAM MANAGER II', 'senior'],
    ['SR. DATA ENGINEER', 'senior'],
    ['SOFTWARE ENGINEER III', 'senior'],
    ['PRINCIPAL SOFTWARE ENGINEER', 'staffPlus'],
    ['STAFF PLATFORM ENGINEER', 'staffPlus'],
    ['LEAD DATA ENGINEER', 'lead'],
    ['HEAD OF PRODUCT', 'lead'],
    ['DIRECTOR, PMO', 'directorPlus'],
    ['VP OF ENGINEERING', 'directorPlus'],
    ['SENIOR DIRECTOR OF PRODUCT', 'directorPlus'],  // precedence over senior
    ['PRODUCT MANAGER', 'base'],
  ] as const)('%s -> %s', (title, tier) => {
    expect(parseSeniority(title)).toBe(tier)
  })
})
