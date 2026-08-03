import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'node:fs'
import * as fs from 'node:fs'

// The ESM build (xlsx.mjs, which this project's "type": "module" resolves to) never
// auto-detects Node's fs -- XLSX.readFile throws "Cannot access file ..." for every
// real path until set_fs is called once. The CJS build auto-binds fs, which is why this
// only surfaces when loaders.ts is imported from an ESM context (i.e. always, in this repo).
XLSX.set_fs(fs)

/** First worksheet -> array of row objects keyed by header row. Missing cells -> null. */
export function readSheetRows(file: string): Record<string, unknown>[] {
  const wb = XLSX.readFile(file, { dense: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })
}

export function readDelimitedRows(file: string, delimiter = ','): Record<string, string>[] {
  return parse(readFileSync(file), {
    columns: true, delimiter, bom: true, relax_column_count: true, skip_empty_lines: true,
  })
}

// The LCA quarterly disclosure workbooks are too large for SheetJS: decompressing a single
// worksheet's XML into one JS string blows past Node's ~536M char string limit (ERR_STRING_TOO_LONG)
// for the FY2025 Q1/Q3 files. exceljs's streaming reader SAX-parses the worksheet XML in chunks
// and yields one Row at a time, so peak memory stays bounded regardless of file size.
export const LCA_COLUMNS = [
  'CASE_NUMBER', 'CASE_STATUS', 'SOC_CODE', 'FULL_TIME_POSITION', 'EMPLOYER_NAME',
  'WORKSITE_POSTAL_CODE', 'WAGE_RATE_OF_PAY_FROM', 'WAGE_RATE_OF_PAY_TO', 'WAGE_UNIT_OF_PAY',
] as const

/** Reduce an exceljs cell value to a JSON-safe primitive (rich text / formula results / dates). */
function normalizeCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return String(value)
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('result' in value) return value.result ?? null
    return null
  }
  return value
}

/** First worksheet, streamed row-by-row -> array of row objects restricted to LCA_COLUMNS. */
export async function readLcaRows(file: string): Promise<Record<string, unknown>[]> {
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(file, {
    sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore', worksheets: 'emit',
  })
  const rows: Record<string, unknown>[] = []
  for await (const worksheet of workbookReader) {
    let headerIndex: Map<string, number> | null = null
    for await (const row of worksheet) {
      if (row.number === 1) {
        headerIndex = new Map()
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const header = normalizeCellValue(cell.value)
          if (typeof header === 'string') headerIndex!.set(header, colNumber)
        })
        continue
      }
      if (!headerIndex) continue // defensive: never saw a header row
      const record: Record<string, unknown> = {}
      for (const col of LCA_COLUMNS) {
        const colNumber = headerIndex.get(col)
        record[col] = colNumber === undefined ? null : normalizeCellValue(row.getCell(colNumber).value)
      }
      rows.push(record)
    }
    break // first worksheet only
  }
  return rows
}
