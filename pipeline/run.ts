// pipeline/run.ts
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { OUT_DIR, RAW_DIR, REPORT_DIR, THRESHOLDS } from './config'
import { readDelimitedRows, readLcaRows, readSheetRows } from './loaders'
import { parseOews } from './lib/parse-oews'
import { rppRowsToMap } from './lib/parse-rpp'
import { gazetteerRowsToMap } from './lib/parse-gazetteer'
import { hudRowsToZipCbsa } from './lib/crosswalk'
import { lcaRowsToRecords, type DropReason, type LcaRecord } from './lib/parse-lca'
import { aggregateEmployers, attachCbsa } from './lib/aggregate'
import { buildEmployerFiles, buildMeta, buildSalaries } from './lib/emit'

// Raw files can live one level deep (e.g. data/raw/oesm25ma/MSA_M2025_dl.xlsx) as well as flat
// in data/raw/. Regexes below match against the basename only, so a subdirectory never needs to
// appear in the pattern itself.
function listRawFiles(): string[] {
  const out: string[] = []
  for (const entry of readdirSync(RAW_DIR, { withFileTypes: true })) {
    if (entry.isFile()) out.push(entry.name)
    else if (entry.isDirectory()) {
      for (const sub of readdirSync(path.join(RAW_DIR, entry.name), { withFileTypes: true })) {
        if (sub.isFile()) out.push(path.join(entry.name, sub.name))
      }
    }
  }
  return out
}
const find = (re: RegExp): string[] => listRawFiles().filter(f => re.test(path.basename(f))).sort()
const find1 = (re: RegExp): string => {
  const hits = find(re)
  if (!hits.length) throw new Error(`no file matching ${re} in ${RAW_DIR} — run 'npm run download'`)
  return path.join(RAW_DIR, hits[hits.length - 1]) // newest by name sort
}
const fail = (msg: string): never => { throw new Error(`DATA QUALITY: ${msg}`) }

// 1. OEWS
const oewsFile = find1(/^MSA.*dl.*\.xlsx$/i)
const year = Number(/M(\d{4})/i.exec(path.basename(oewsFile))?.[1])
if (!year) fail(`cannot read year from ${path.basename(oewsFile)}`)
console.log(`OEWS: ${oewsFile} (year ${year})`)
const oewsRows = readSheetRows(oewsFile)
const { records: salaries, areas } = parseOews(oewsRows)
const metroCount = new Set(salaries.map(s => s.cbsa)).size
console.log(`  ${salaries.length} salary rows across ${metroCount} metros`)
if (metroCount < THRESHOLDS.minMetros) fail(`only ${metroCount} metros (< ${THRESHOLDS.minMetros})`)
if (salaries.length < THRESHOLDS.minSalaryRows) fail(`only ${salaries.length} salary rows (< ${THRESHOLDS.minSalaryRows})`)

// 2. RPP + gazetteer + HUD
const rpp = rppRowsToMap(readDelimitedRows(find1(/^MARPP.*\.csv$/i)))
// 2025-vintage Census gazetteer files are pipe-delimited, not tab-delimited as older vintages were.
const coords = gazetteerRowsToMap(readDelimitedRows(find1(/gaz_cbsa.*\.txt$/i), '|'))
const zipCbsa = hudRowsToZipCbsa(readSheetRows(find1(/^ZIP_CBSA.*\.xlsx$/i)))
console.log(`  RPP ${rpp.values.size} metros (vintage ${rpp.year}) · gazetteer ${coords.size} CBSAs · HUD ${zipCbsa.size} ZIPs`)

// 3. LCA (sequential — each quarterly workbook is large)
const lcaFiles = find(/^LCA_Disclosure.*\.xlsx$/i)
if (lcaFiles.length < 2) fail(`only ${lcaFiles.length} LCA files (< 2) — download more quarters`)
const lcaRecords: LcaRecord[] = []
const lcaDrops: Record<DropReason, number> = { status: 0, partTime: 0, soc: 0, unit: 0, wage: 0, range: 0, zip: 0, employer: 0 }
for (const f of lcaFiles) {
  const { records: recs, drops } = lcaRowsToRecords(await readLcaRows(path.join(RAW_DIR, f)))
  console.log(`  ${f}: ${recs.length} usable filings`)
  for (const r of recs) lcaRecords.push(r)
  for (const k of Object.keys(drops) as DropReason[]) lcaDrops[k] += drops[k]
}

// Quarterly LCA extracts can be cumulative snapshots rather than disjoint quarters, which would
// double-count the same filing. Dedupe by non-empty caseNumber before the ZIP join; empty
// caseNumbers are treated as unique (never collapsed against each other or against a second
// empty one).
const seenCaseNumbers = new Set<string>()
const dedupedLcaRecords: LcaRecord[] = []
let duplicateCaseNumbers = 0
for (const r of lcaRecords) {
  if (r.caseNumber && seenCaseNumbers.has(r.caseNumber)) { duplicateCaseNumbers++; continue }
  if (r.caseNumber) seenCaseNumbers.add(r.caseNumber)
  dedupedLcaRecords.push(r)
}
console.log(`  ${duplicateCaseNumbers} duplicate CASE_NUMBERs dropped (cross-quarter overlap)`)
if (dedupedLcaRecords.length < THRESHOLDS.minLcaRecords) fail(`only ${dedupedLcaRecords.length} usable LCA records after dedupe (< ${THRESHOLDS.minLcaRecords})`)

const { matched, matchRate, unmatchedZips } = attachCbsa(dedupedLcaRecords, zipCbsa)
console.log(`  ZIP->CBSA match rate ${(matchRate * 100).toFixed(1)}%`)
if (matchRate < THRESHOLDS.minZipMatchRate) fail(`ZIP match rate ${matchRate.toFixed(3)} (< ${THRESHOLDS.minZipMatchRate})`)

// 4. Build + coverage assertions
const { meta, droppedNoArea, droppedNoCoords } = buildMeta(salaries, areas, coords, rpp, year)
const rppCoverage = meta.metros.filter(m => m.rpp !== null).length / (meta.metros.length || 1)
if (rppCoverage < THRESHOLDS.minRppCoverage) fail(`RPP coverage ${(rppCoverage * 100).toFixed(1)}% (< ${THRESHOLDS.minRppCoverage * 100}%)`)
meta.generated = new Date().toISOString()

// 5. Emit — restrict salaries/employers to the metros that actually made it into meta.metros
// (buildMeta already dropped anything missing an OEWS area title or gazetteer coordinates).
const keepCbsa = new Set(meta.metros.map(m => m.cbsa))
mkdirSync(path.join(OUT_DIR, 'employers'), { recursive: true })
writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta)) // meta.rppYear/capValue already stamped by buildMeta
const { salaries: salariesJson, excluded: salariesExcluded } = buildSalaries(salaries, keepCbsa)
writeFileSync(path.join(OUT_DIR, 'salaries.json'), JSON.stringify(salariesJson))
const { files: employerFiles, excluded: employerFilesExcluded } = buildEmployerFiles(aggregateEmployers(matched), keepCbsa)
for (const { cbsa, body } of employerFiles) {
  writeFileSync(path.join(OUT_DIR, 'employers', `${cbsa}.json`), JSON.stringify(body))
}

// 6. Report
mkdirSync(REPORT_DIR, { recursive: true })
writeFileSync(path.join(REPORT_DIR, `run-${meta.generated.slice(0, 10)}.json`), JSON.stringify({
  generated: meta.generated, year, rppYear: meta.rppYear, capValue: meta.capValue,
  oewsFile: path.basename(oewsFile), lcaFiles,
  metros: meta.metros.length, metrosDroppedNoArea: droppedNoArea, metrosDroppedNoCoords: droppedNoCoords,
  salaryRows: salaries.length, salariesExcluded, employerFilesExcluded,
  lcaRaw: lcaRecords.length, lcaDrops, lcaDuplicateCaseNumbers: duplicateCaseNumbers,
  lcaUsable: dedupedLcaRecords.length, lcaMatched: matched.length, zipMatchRate: matchRate,
  rppCoverage, employerFiles: employerFiles.length,
  topUnmatchedZips: [...unmatchedZips.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25),
}, null, 2))
console.log(`DONE: ${meta.metros.length} metros, ${employerFiles.length} employer files -> ${OUT_DIR}`)
