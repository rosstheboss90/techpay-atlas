import { describe, expect, it } from 'vitest'
import { cell, makeCell, TOP_CODE } from '../lib/num'

describe('makeCell', () => {
  it('substitutes the vintage top code for a `#` cell, not the current constant (T2)', () => {
    const cell2019 = makeCell(208_000)
    expect(cell2019('#')).toEqual({ value: 208_000, capped: true })
  })

  it('does not leak the current top code into an older vintage', () => {
    const cell2019 = makeCell(208_000)
    expect(cell2019('#').value).not.toBe(TOP_CODE)
  })

  it('leaves non-top-coded cells to num() unchanged', () => {
    const cell2019 = makeCell(208_000)
    expect(cell2019('$133,080')).toEqual({ value: 133_080, capped: false })
    expect(cell2019('*')).toEqual({ value: null, capped: false })
  })

  it('the default `cell` export still uses the current vintage top code', () => {
    expect(cell('#')).toEqual({ value: TOP_CODE, capped: true })
  })
})
