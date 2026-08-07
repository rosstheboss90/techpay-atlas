// Executable entry point for `npm run archive:msa [-- --year YYYY] [--force]`.
//
// Separate from archive-nat.ts because the inputs differ by two orders of magnitude: the national
// file is 290KB and one row per occupation, the MSA file is 39MB and ~150k rows. Sharing an entry
// point would make one carry the other's constraints.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RAW_DIR } from './config'
import { readSheetRows } from './loaders'
import { parseOews } from './lib/parse-oews'
import { makeCell } from './lib/num'
import { assertWritable, buildMsaArchive, HISTORY_DIR, msaArchiveFilename, msaArchivePath, type MsaMetroRecord } from './lib/history'
import { OEWS_NAT_YEARS, topCodeForYear } from './vintages'

const args = process.argv.slice(2)
const force = args.includes('--force')
const yearArg = args.indexOf('--year')
const years = yearArg >= 0 ? [Number(args[yearArg + 1])] : [...OEWS_NAT_YEARS]

/** MSA_M<year>_dl.xlsx, flat in data/raw or one level deep (the zip extracts a folder). */
function findMsaFile(year: number): string | null {
  const re = new RegExp(`^MSA_M${year}_dl.*\\.xlsx$`, 'i')
  for (const entry of readdirSync(RAW_DIR, { withFileTypes: true })) {
    if (entry.isFile() && re.test(entry.name)) return path.join(RAW_DIR, entry.name)
    if (entry.isDirectory()) {
      for (const sub of readdirSync(path.join(RAW_DIR, entry.name), { withFileTypes: true })) {
        if (sub.isFile() && re.test(sub.name)) return path.join(RAW_DIR, entry.name, sub.name)
      }
    }
  }
  return null
}

mkdirSync(HISTORY_DIR, { recursive: true })
let written = 0, skipped = 0, missing = 0, errored = 0
for (const year of years) {
  const file = findMsaFile(year)
  if (!file) { console.warn(`MISSING: no MSA_M${year}_dl.xlsx in ${RAW_DIR} — see the spec for download URLs`); missing++; continue }
  const exists = existsSync(msaArchivePath(year))
  if (exists && !force) { console.log(`SKIP: ${msaArchiveFilename(year)} already archived (pass --force to overwrite)`); skipped++; continue }
  try {
    assertWritable(year, { exists, force })
    const topCode = topCodeForYear(year)
    const { records, areas } = parseOews(readSheetRows(file), makeCell(topCode))
    const metros: Record<string, Record<string, MsaMetroRecord>> = {}
    for (const r of records) {
      ;(metros[r.cbsa] ??= {})[r.soc] = { p50: r.p50, emp: r.emp, capped: r.capped }
    }
    const archive = buildMsaArchive(year, topCode, path.basename(file), areas, metros)
    writeFileSync(msaArchivePath(year), JSON.stringify(archive))
    console.log(`WROTE: ${year} — ${Object.keys(metros).length} metros, top code $${topCode.toLocaleString()}`)
    written++
  } catch (e) {
    console.error(`ERROR: ${year} — ${(e as Error).message}`)
    errored++
  }
}
console.log(`${written} written, ${skipped} skipped, ${missing} missing, ${errored} errored (of ${years.length} vintage(s))`)
process.exitCode = missing > 0 || errored > 0 ? 1 : 0
