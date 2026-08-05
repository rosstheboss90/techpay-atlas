import { describe, expect, it } from 'vitest'
import { normalizeTitle } from '../lib/normalize-title'

describe('normalizeTitle', () => {
  it('collapses seniority + level variants of the same job to one canonical title', () => {
    const forms = [
      'SOFTWARE ENGINEER',
      'SR. SOFTWARE ENGINEER II',
      'SENIOR SOFTWARE ENGINEER',
      'STAFF SOFTWARE ENGINEER',
      'PRINCIPAL SOFTWARE ENGINEER III',
      'SOFTWARE ENGINEER L5',
      'SOFTWARE ENGINEER (REMOTE)',
    ]
    for (const f of forms) expect(normalizeTitle(f)).toBe('SOFTWARE ENGINEER')
  })

  it('keeps role-defining words (manager, director, architect)', () => {
    expect(normalizeTitle('SENIOR PRODUCT MANAGER')).toBe('PRODUCT MANAGER')
    expect(normalizeTitle('DIRECTOR OF ENGINEERING')).toBe('DIRECTOR OF ENGINEERING')
    expect(normalizeTitle('PRINCIPAL DATA ARCHITECT II')).toBe('DATA ARCHITECT')
  })

  it('peels multiple trailing level tokens', () => {
    expect(normalizeTitle('DATA ENGINEER II L4')).toBe('DATA ENGINEER')
    expect(normalizeTitle('ANALYST GRADE 3')).toBe('ANALYST')
  })

  it('returns empty when nothing meaningful survives, and is idempotent', () => {
    expect(normalizeTitle('SENIOR II')).toBe('')
    const once = normalizeTitle('SR. DATA SCIENTIST II')
    expect(once).toBe('DATA SCIENTIST')
    expect(normalizeTitle(once)).toBe(once) // idempotent
  })
})
