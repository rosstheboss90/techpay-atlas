import { describe, expect, it } from 'vitest'
import { assertLcaHeader, isBlankLcaRecord, LCA_COLUMNS } from '../loaders'

const fullRecord = () => Object.fromEntries(LCA_COLUMNS.map((c, i) => [c, `v${i}`])) as Record<string, unknown>

describe('isBlankLcaRecord', () => {
  it('is true when every LCA_COLUMNS value is null (DOL trailing padding rows)', () => {
    const blank = Object.fromEntries(LCA_COLUMNS.map(c => [c, null]))
    expect(isBlankLcaRecord(blank)).toBe(true)
  })
  it('is false when at least one LCA_COLUMNS value is non-null', () => {
    const partial = Object.fromEntries(LCA_COLUMNS.map(c => [c, null]))
    partial[LCA_COLUMNS[0]] = 'CERTIFIED'
    expect(isBlankLcaRecord(partial)).toBe(false)
  })
  it('is false for a fully populated record', () => {
    expect(isBlankLcaRecord(fullRecord())).toBe(false)
  })
})

describe('assertLcaHeader', () => {
  it('does not throw when every LCA_COLUMNS entry is present in the header', () => {
    const headerIndex = new Map(LCA_COLUMNS.map((c, i) => [c, i + 1]))
    expect(() => assertLcaHeader(headerIndex, 'LCA_Disclosure_Data_FY2025_Q1.xlsx')).not.toThrow()
  })
  it('throws with the filename and every missing column name', () => {
    const headerIndex = new Map(LCA_COLUMNS.filter(c => c !== 'EMPLOYER_NAME' && c !== 'SOC_CODE').map((c, i) => [c, i + 1]))
    let message = ''
    try {
      assertLcaHeader(headerIndex, 'LCA_Disclosure_Data_FY2025_Q1.xlsx')
      expect.unreachable('expected assertLcaHeader to throw')
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('LCA_Disclosure_Data_FY2025_Q1.xlsx')
    expect(message).toContain('SOC_CODE')
    expect(message).toContain('EMPLOYER_NAME')
  })
})
