// Executable entry point for `npm run archive:nat [-- --year YYYY] [--force]`. Writes one
// data/history/oews-nat-<year>.json vintage per year in OEWS_NAT_YEARS (or a single year with
// --year). History is append-only (see lib/history.ts's assertWritable) — a vintage already on
// disk is skipped unless --force is passed.
//
// Each vintage is independently optional at download time (see download.ts), so a missing file
// here is a warning, not an abort: the run continues and reports the gap in its summary, and
// exits non-zero only if something EXPECTED to be there was missing.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RAW_DIR } from './config'
import { readSheetRows } from './loaders'
import { parseOewsNational } from './lib/parse-oews-nat'
import { archivePath, assertWritable, buildNationalArchive, HISTORY_DIR } from './lib/history'
import { OEWS_NAT_YEARS, topCodeForYear } from './vintages'

const args = process.argv.slice(2)
const yearArg = args.includes('--year') ? Number(args[args.indexOf('--year') + 1]) : null
const force = args.includes('--force')
const years = yearArg !== null ? [yearArg] : [...OEWS_NAT_YEARS]

// National files can live flat in data/raw/ or one level deep in data/raw/oesm<YY>nat/ (the zip
// extracts into a subdirectory), same layout convention as run.ts's listRawFiles for the MSA file.
function findNationalFile(year: number): string | null {
  const basename = `national_M${year}_dl.xlsx`
  const flat = path.join(RAW_DIR, basename)
  if (existsSync(flat)) return flat
  for (const entry of readdirSync(RAW_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const nested = path.join(RAW_DIR, entry.name, basename)
    if (existsSync(nested)) return nested
  }
  return null
}

let written = 0, skipped = 0, missing = 0, errored = 0
const errors: { year: number; message: string }[] = []

// A parse failure on one vintage (e.g. undiscovered schema drift) must not abort the whole run —
// six good years should still archive even if a seventh's file is broken. Each vintage is caught
// independently and reported by year; the run still exits non-zero at the end if anything errored,
// so a per-vintage failure is loud in the summary even though it doesn't stop the loop.
for (const year of years) {
  try {
    const file = findNationalFile(year)
    if (!file) {
      console.warn(`MISSING: no national_M${year}_dl.xlsx in ${RAW_DIR} (flat or one level deep) — skipping`)
      missing++
      continue
    }

    const exists = existsSync(archivePath(year))
    if (exists && !force) {
      console.log(`SKIP: ${path.basename(archivePath(year))} already archived (pass --force to overwrite)`)
      skipped++
      continue
    }
    assertWritable(year, { exists, force })

    const topCode = topCodeForYear(year)
    const roles = parseOewsNational(readSheetRows(file), topCode)
    const archive = buildNationalArchive(year, topCode, path.basename(file), roles)

    mkdirSync(HISTORY_DIR, { recursive: true })
    writeFileSync(archivePath(year), JSON.stringify(archive, null, 1))
    console.log(`WROTE: ${year} — ${Object.keys(roles).length} role(s), top code $${topCode.toLocaleString()}`)
    written++
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`ERROR: vintage ${year} failed — ${message}`)
    errors.push({ year, message })
    errored++
  }
}

console.log(
  `\n${written} written, ${skipped} skipped, ${missing} missing, ${errored} errored ` +
  `(of ${years.length} vintage(s) requested)`,
)
if (errors.length > 0) {
  console.error(`\nFailed vintage(s): ${errors.map(e => `${e.year} (${e.message})`).join('; ')}`)
}
process.exitCode = missing > 0 || errored > 0 ? 1 : 0
