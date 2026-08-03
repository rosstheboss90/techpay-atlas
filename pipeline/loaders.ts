import * as XLSX from 'xlsx'
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
