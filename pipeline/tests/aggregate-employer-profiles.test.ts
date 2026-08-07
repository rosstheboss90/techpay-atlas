import { describe, expect, it } from 'vitest'
import { aggregateEmployerProfiles } from '../lib/aggregate-employer-profiles'
import { indexAliases, type AliasFile } from '../lib/employer-identity'
import type { LocatedLca } from '../lib/aggregate'

const aliases: AliasFile = {
  version: 1,
  entities: [{ canonical: 'amazon', display: 'Amazon', category: 'direct',
               match: ['AMAZONCOM SERVICES', 'AMAZON WEB SERVICES'] }],
}
const idx = indexAliases(aliases)

const rec = (employer: string, annualWage: number, cbsa = '12420', soc = '15-1252'): LocatedLca =>
  ({ soc, targetSoc: soc, title: '', employer, zip: '78701', annualWage, caseNumber: '', cbsa })

describe('aggregateEmployerProfiles', () => {
  it('merges aliased entities and lists each filing entity separately', () => {
    const profiles = aggregateEmployerProfiles([
      rec('Amazon.com Services LLC', 100000),
      rec('Amazon.com Services LLC', 200000),
      rec('Amazon Web Services, Inc.', 300000),
    ], idx)
    const p = profiles.get('amazon')!
    expect(p.display).toBe('Amazon')
    expect(p.totalFilings).toBe(3)
    expect(p.entities).toEqual([
      { name: 'Amazon.com Services LLC', filings: 2 },
      { name: 'Amazon Web Services, Inc.', filings: 1 },
    ])
  })

  it('national filings equal the sum of per-metro filings', () => {
    const profiles = aggregateEmployerProfiles([
      rec('Beta LLC', 100000, '12420'),
      rec('Beta LLC', 120000, '42660'),
      rec('Beta LLC', 140000, '42660'),
    ], idx)
    const role = profiles.get('BETA')!.roles['15-1252']
    expect(role.national.filings).toBe(3)
    expect(role.metros.reduce((n, m) => n + m.filings, 0)).toBe(3)
  })

  it('counts filings that would rank outside a per-metro top-15 cut', () => {
    // 15 employers with 5 filings each in one metro, plus a 16th with 1 filing there
    // and 40 more spread across another metro. Building from emitted files would drop
    // the 16th from metro A entirely and undercount its national total.
    const rows: LocatedLca[] = []
    for (let i = 0; i < 15; i++) {
      for (let n = 0; n < 5; n++) rows.push(rec(`Big${i} LLC`, 100000, '12420'))
    }
    rows.push(rec('Small LLC', 90000, '12420'))
    for (let n = 0; n < 40; n++) rows.push(rec('Small LLC', 90000, '42660'))

    const p = aggregateEmployerProfiles(rows, idx).get('SMALL')!
    expect(p.totalFilings).toBe(41)
    expect(p.roles['15-1252'].metros.find(m => m.cbsa === '12420')!.filings).toBe(1)
  })

  it('resolves one display name globally, not per metro', () => {
    const profiles = aggregateEmployerProfiles([
      rec('Acme Corp', 100000, '12420'),
      rec('ACME CORP', 110000, '42660'),
      rec('ACME CORP', 120000, '42660'),
    ], idx)
    expect([...profiles.keys()]).toEqual(['ACME'])
    expect(profiles.get('ACME')!.display).toBe('ACME CORP')
  })

  it('computes national quartiles across all metros', () => {
    const rows = [10, 20, 30, 40].map(w => rec('Beta LLC', w * 1000))
    const role = aggregateEmployerProfiles(rows, idx).get('BETA')!.roles['15-1252']
    expect(role.national.median).toBe(25000)
    expect(role.national.p25).toBe(20000)
    expect(role.national.p75).toBe(30000)
  })
})
