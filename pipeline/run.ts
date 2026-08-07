// pipeline/run.ts
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { EMPLOYER_ALIASES, OUT_DIR, RAW_DIR, REPORT_DIR, THRESHOLDS } from './config'
import { readDelimitedRows, readLcaRows, readSheetRows } from './loaders'
import { parseOews } from './lib/parse-oews'
import { rppRowsToMap } from './lib/parse-rpp'
import { gazetteerRowsToMap } from './lib/parse-gazetteer'
import { hudRowsToZipCbsa } from './lib/crosswalk'
import { lcaRowsToRecords, type DropReason, type LcaRecord } from './lib/parse-lca'
import { aggregateEmployers, attachCbsa } from './lib/aggregate'
import { aggregateEmployerProfiles } from './lib/aggregate-employer-profiles'
import { baseKey, indexAliases, type AliasFile } from './lib/employer-identity'
import { aliasCollapse, aliasCoverage, buildEmployerArtifacts, maxEntityShare } from './lib/emit-employers'
import { aggregateTitles } from './lib/aggregate-titles'
import { aggregateConflation } from './lib/aggregate-conflation'
import { FAMILIES } from './lib/titles'
import { buildConflation, buildEmployerFiles, buildMeta, buildSalaries, buildTitles } from './lib/emit'

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
const find = (re: RegExp): string[] =>
  listRawFiles().filter(f => re.test(path.basename(f))).sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
const find1 = (re: RegExp): string => {
  const hits = find(re)
  if (!hits.length) throw new Error(`no file matching ${re} in ${RAW_DIR} — run 'npm run download'`)
  return path.join(RAW_DIR, hits[hits.length - 1]) // newest by basename sort
}
const fail = (msg: string): never => { throw new Error(`DATA QUALITY: ${msg}`) }

// HUD's own filenames encode MMYYYY (e.g. ZIP_CBSA_032026.xlsx = Mar 2026), so a plain
// lexicographic basename sort picks Dec-2025 (`122025`) over Mar-2026 (`032026`) as "newest" —
// '1' > '0' at the first differing character. Parse MMYYYY into YYYYMM before comparing.
function newestHudFile(): string {
  const hits = find(/^ZIP_CBSA.*\.xlsx$/i)
  if (!hits.length) throw new Error(`no file matching ZIP_CBSA*.xlsx in ${RAW_DIR} — run 'npm run download'`)
  const withKey = hits.map(f => {
    const m = /ZIP_CBSA_(\d{2})(\d{4})/i.exec(path.basename(f))
    if (!m) fail(`cannot parse MMYYYY from HUD filename ${path.basename(f)}`)
    const [, mm, yyyy] = m!
    return { f, key: `${yyyy}${mm}` } // YYYYMM, lexicographically sortable
  })
  withKey.sort((a, b) => a.key.localeCompare(b.key))
  return path.join(RAW_DIR, withKey[withKey.length - 1].f)
}

// e.g. ['LCA_Disclosure_Data_FY2025_Q1.xlsx', ..., '..._Q4.xlsx'] -> 'FY2025 Q1–Q4'
function deriveLcaPeriod(files: string[]): string {
  const parsed = files.map(f => {
    const m = /FY(\d{4})_Q(\d)/i.exec(path.basename(f))
    if (!m) fail(`cannot parse FY/quarter from LCA filename ${path.basename(f)}`)
    return { fy: m![1], q: Number(m![2]) }
  })
  const fys = [...new Set(parsed.map(p => p.fy))]
  if (fys.length > 1) fail(`LCA files span multiple fiscal years: ${fys.join(', ')}`)
  const qs = [...new Set(parsed.map(p => p.q))].sort((a, b) => a - b)
  const qLabel = qs.length > 1 ? `Q${qs[0]}–Q${qs[qs.length - 1]}` : `Q${qs[0]}`
  return `FY${fys[0]} ${qLabel}`
}

// 1. OEWS — scoped in a function so its ~150k raw sheet rows are collectible before the LCA
// phase (which streams multiple large quarterly workbooks) runs.
function loadOews() {
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
  return { oewsFile, year, salaries, areas }
}
const { oewsFile, year, salaries, areas } = loadOews()

// 2. RPP + gazetteer + HUD
const rpp = rppRowsToMap(readDelimitedRows(find1(/^MARPP.*\.csv$/i)))
// 2025-vintage Census gazetteer files are pipe-delimited, not tab-delimited as older vintages were.
const coords = gazetteerRowsToMap(readDelimitedRows(find1(/gaz_cbsa.*\.txt$/i), '|'))
const hudFile = newestHudFile()
const zipCbsa = hudRowsToZipCbsa(readSheetRows(hudFile))
console.log(`  RPP ${rpp.values.size} metros (vintage ${rpp.year}) · gazetteer ${coords.size} CBSAs · HUD ${zipCbsa.size} ZIPs`)

// 3. LCA (sequential — each quarterly workbook is large)
const lcaFiles = find(/^LCA_Disclosure.*\.xlsx$/i)
if (lcaFiles.length < 2) fail(`only ${lcaFiles.length} LCA files (< 2) — download more quarters`)
const lcaPeriod = deriveLcaPeriod(lcaFiles)
const lcaRecords: LcaRecord[] = []
const lcaDrops: Record<DropReason, number> = {
  status: 0, certifiedWithdrawn: 0, partTime: 0, soc: 0, unit: 0, wage: 0, range: 0, zip: 0, employer: 0,
}
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
// All-SOC population since the title lens (Task 3b below reads `matched`, unfiltered); the
// employer-layer-specific gate on `employerRecords` (target-SOC only) lives further down.
if (dedupedLcaRecords.length < THRESHOLDS.minLcaRecords) fail(`only ${dedupedLcaRecords.length} usable LCA records after dedupe (< ${THRESHOLDS.minLcaRecords})`)

const { matched, matchRate, unmatchedZips } = attachCbsa(dedupedLcaRecords, zipCbsa)
console.log(`  ZIP->CBSA match rate ${(matchRate * 100).toFixed(1)}%`)
if (matchRate < THRESHOLDS.minZipMatchRate) fail(`ZIP match rate ${matchRate.toFixed(3)} (< ${THRESHOLDS.minZipMatchRate})`)

// The title layer (Task 2+) wants ALL certified full-time filings, any SOC; the employer layer
// still wants only target-SOC filings, so filter here (moved from parse-time in parse-lca.ts).
const employerRecords = matched.filter(r => r.targetSoc).map(r => ({ ...r, soc: r.targetSoc! }))
const lcaNonTargetSoc = matched.length - employerRecords.length
if (employerRecords.length < THRESHOLDS.minLcaRecords) fail(`only ${employerRecords.length} target-SOC LCA records for the employer layer (< ${THRESHOLDS.minLcaRecords})`)

// meta.metros[].lcaFilings must stay scoped to target-SOC (registry-role) filings, NOT all of
// `matched` — the site treats lcaFilings > 0 as "an employers/<cbsa>.json file exists" (it skips
// fetching when 0). buildEmployerFiles below is built from employerRecords, so this has to match
// that same input or a metro with only off-registry-SOC filings would advertise filings it can't
// back with an employer file (broken fetch on click).
const filingsByCbsa = new Map<string, number>()
for (const r of employerRecords) filingsByCbsa.set(r.cbsa, (filingsByCbsa.get(r.cbsa) ?? 0) + 1)

// 3b. Title layer — same deduped, CBSA-matched stream as the employer layer, but ALL SOCs
// (no target-SOC filter): titles must see filings whose SOC falls outside our 21 roles.
const titleAgg = aggregateTitles(matched)
for (const fam of titleAgg.families)
  for (const b of fam.buckets)
    if (b.national.filings === 0) fail(`title bucket ${fam.key}/${b.key} ("${b.label}") has 0 national filings — regex likely broken`)
if (titleAgg.matchedTotal < THRESHOLDS.minTitleFilings) fail(`only ${titleAgg.matchedTotal} title-matched LCA filings (< ${THRESHOLDS.minTitleFilings})`)

// Cross-family overlap: a title should hit at most one bucket per family, and — by design —
// essentially never span multiple families. Checked on a sampled subset (matched can be
// 500k+ rows and this re-runs every FAMILIES regex per record).
const overlapSampleSize = 20_000
const overlapStep = Math.max(1, Math.floor(matched.length / overlapSampleSize))
const overlapSample = matched.filter((_, i) => i % overlapStep === 0).slice(0, overlapSampleSize)
let sampleMatched = 0, sampleOverlap = 0
for (const r of overlapSample) {
  const familyHits = FAMILIES.filter(f => f.buckets.some(b => b.re.test(r.title))).length
  if (familyHits >= 1) sampleMatched++
  if (familyHits >= 2) sampleOverlap++
}
const titleFamilyOverlapRate = sampleMatched ? sampleOverlap / sampleMatched : 0
if (titleFamilyOverlapRate > THRESHOLDS.maxTitleFamilyOverlap)
  fail(`title family overlap rate ${titleFamilyOverlapRate.toFixed(4)} (> ${THRESHOLDS.maxTitleFamilyOverlap}) — ${sampleOverlap}/${sampleMatched} sampled matched filings hit >=2 families`)
console.log(`  titles: ${titleAgg.matchedTotal} matched filings, overlap rate ${(titleFamilyOverlapRate * 100).toFixed(3)}% (sample ${overlapSample.length})`)
for (const fam of titleAgg.families)
  for (const b of fam.buckets)
    console.log(`    ${fam.key}/${b.key} (${b.label}): ${b.national.filings} national filings`)

// 3c. Title↔SOC conflation matrix — same all-SOC stream; normalize free-text titles and record how
// each common title scatters across official SOC codes (role-similarity variant 2).
const conflationAgg = aggregateConflation(matched)
if (conflationAgg.titles.length < THRESHOLDS.minConflationTitles)
  fail(`only ${conflationAgg.titles.length} conflation titles cleared the floor (< ${THRESHOLDS.minConflationTitles}) — title normalization likely broke`)
console.log(`  conflation: ${conflationAgg.titles.length} titles (of ${conflationAgg.distinctTitles} distinct), ${conflationAgg.totalFilings} filings`)

// 4. Build + coverage assertions
const { meta, droppedNoArea, droppedNoCoords } = buildMeta(salaries, areas, coords, rpp, year, filingsByCbsa)
const rppCoverage = meta.metros.filter(m => m.rpp !== null).length / (meta.metros.length || 1)
if (rppCoverage < THRESHOLDS.minRppCoverage) fail(`RPP coverage ${(rppCoverage * 100).toFixed(1)}% (< ${THRESHOLDS.minRppCoverage * 100}%)`)
meta.generated = new Date().toISOString()
meta.lcaPeriod = lcaPeriod
meta.sources = {
  oews: path.basename(oewsFile), lca: lcaFiles.map(f => path.basename(f)), hud: path.basename(hudFile),
  zipMatchRate: matchRate,
}

// 5. Emit — restrict salaries/employers to the metros that actually made it into meta.metros
// (buildMeta already dropped anything missing an OEWS area title or gazetteer coordinates).
// Stale output is deleted only now, after every assertion above has passed — a failed run must
// never destroy the previously-committed good output.
const keepCbsa = new Set(meta.metros.map(m => m.cbsa))

// 5a. Employer layer — the target-SOC stream transposed to employer-major. Built from the
// in-memory records, never from the emitted per-CBSA files: those are truncated at topN=15, so a
// rollup over them would undercount any employer ranked 16th in a metro.
//
// Scoped to keepCbsa FIRST. buildMeta drops metros with no OEWS area title or gazetteer
// coordinates, and an unscoped aggregation carried those CBSAs into employer profiles where the
// site has no name for them — they rendered as bare codes like "18180" next to dollar figures,
// in 96 of 500 profiles. Filtering the records (rather than the emitted metros) also keeps
// national filings equal to the sum of per-metro filings, which a unit test pins.
const employerScoped = employerRecords.filter(r => keepCbsa.has(r.cbsa))
const employerOutOfScope = employerRecords.length - employerScoped.length
const aliasFile: AliasFile = JSON.parse(readFileSync(EMPLOYER_ALIASES, 'utf8'))
const aliasIndex = indexAliases(aliasFile)
const employerProfiles = aggregateEmployerProfiles(employerScoped, aliasIndex)
console.log(`  employers: ${employerProfiles.size} canonical filers ` +
  `(${employerOutOfScope} filings outside the ${keepCbsa.size} covered metros excluded)`)

if (employerProfiles.size < THRESHOLDS.minEmployerProfiles)
  fail(`only ${employerProfiles.size} canonical employers (< ${THRESHOLDS.minEmployerProfiles}) — normalization likely broke`)

// Alias-file integrity. These three checks are PER-MATCH, not per-entity. The previous version
// only asked whether each entity's canonical id appeared among aliased keys, which an entity
// with five match keys passes while four of them are dead — the comment claimed a guarantee the
// code did not provide.
//
// (a) A match value is looked up as `index.get(baseKey(name))`, so anything not already in
//     baseKey form can never fire. The natural thing to write — the raw filed name, or a name
//     ending in a legal suffix — is exactly what silently never matches.
for (const e of aliasFile.entities)
  for (const m of e.match)
    if (baseKey(m) !== m)
      fail(`alias match "${m}" (${e.canonical}) is not in baseKey form — it can never fire; use "${baseKey(m)}"`)

// (b) Two entities claiming one key resolved last-wins, in file order, with no signal.
const claimedBy = new Map<string, string>()
for (const e of aliasFile.entities)
  for (const m of e.match) {
    const prev = claimedBy.get(m)
    if (prev && prev !== e.canonical) fail(`alias key "${m}" claimed by both ${prev} and ${e.canonical}`)
    claimedBy.set(m, e.canonical)
  }

// (c) Liveness per match, not per entity. A key that matches no filing is stale curation: the
//     merge it was written to perform silently stopped happening.
const filedKeys = new Set<string>()
for (const r of employerScoped) filedKeys.add(baseKey(r.employer))
const deadMatches = aliasFile.entities
  .flatMap(e => e.match.filter(m => !filedKeys.has(m)).map(m => `${e.canonical}:${m}`))
if (deadMatches.length) fail(`alias match keys matched no filed employer: ${deadMatches.join(', ')}`)

const collapse = aliasCollapse(employerProfiles) // reported, not enforced — see its doc comment
const coverage = aliasCoverage(employerProfiles, THRESHOLDS.employerPrerenderCount)
if (coverage < THRESHOLDS.minAliasCoverage)
  fail(`alias file covers only ${(coverage * 100).toFixed(1)}% of top-${THRESHOLDS.employerPrerenderCount} filings (< ${THRESHOLDS.minAliasCoverage * 100}%) — rotted or half-applied`)
if (coverage > THRESHOLDS.maxAliasCoverage)
  fail(`alias file covers ${(coverage * 100).toFixed(1)}% of top-${THRESHOLDS.employerPrerenderCount} filings (> ${THRESHOLDS.maxAliasCoverage * 100}%) — resolution is swallowing more than curation explains`)
const biggest = maxEntityShare(employerProfiles)
if (biggest.share > THRESHOLDS.maxEntityShare)
  fail(`"${biggest.slug}" holds ${(biggest.share * 100).toFixed(1)}% of all filings (> ${THRESHOLDS.maxEntityShare * 100}%) — an over-broad match rule is swallowing unrelated companies`)
console.log(`  alias collapse ${(collapse * 100).toFixed(1)}% (reported), head coverage ${(coverage * 100).toFixed(1)}%, ` +
  `largest entity ${biggest.slug} ${(biggest.share * 100).toFixed(1)}%`)

// Slugs become filenames and route segments. A collision would silently overwrite a profile
// file; an empty slug would write ".json" and produce an unroutable page.
const slugOwners = new Map<string, string>()
for (const p of employerProfiles.values()) {
  if (!p.slug) fail(`employer "${p.display}" (key ${p.key}) produced an empty slug`)
  const owner = slugOwners.get(p.slug)
  if (owner) fail(`slug collision "${p.slug}": both ${owner} and ${p.key}`)
  slugOwners.set(p.slug, p.key)
}

// No emitted profile may name a metro the site cannot label. This is the assertion the bare-CBSA
// leak got past: the scoping above is the fix, this is the guard that it stays fixed.
for (const p of employerProfiles.values())
  for (const [soc, role] of Object.entries(p.roles))
    for (const m of role.metros)
      if (!keepCbsa.has(m.cbsa)) fail(`employer "${p.slug}" role ${soc} references uncovered CBSA ${m.cbsa}`)

rmSync(path.join(OUT_DIR, 'employers'), { recursive: true, force: true })
mkdirSync(path.join(OUT_DIR, 'employers'), { recursive: true })
writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta)) // meta.rppYear/topCodeValue already stamped by buildMeta
const { salaries: salariesJson, excluded: salariesExcluded } = buildSalaries(salaries, keepCbsa)
writeFileSync(path.join(OUT_DIR, 'salaries.json'), JSON.stringify(salariesJson))
const { files: employerFiles, excluded: employerFilesExcluded } = buildEmployerFiles(aggregateEmployers(employerRecords), keepCbsa)
for (const { cbsa, body } of employerFiles) {
  writeFileSync(path.join(OUT_DIR, 'employers', `${cbsa}.json`), JSON.stringify(body))
}
const employerArtifacts = buildEmployerArtifacts(
  employerProfiles, lcaPeriod, THRESHOLDS.employerPrerenderCount)
rmSync(path.join(OUT_DIR, 'employers-by-name'), { recursive: true, force: true })
rmSync(path.join(OUT_DIR, 'employer-index'), { recursive: true, force: true })
mkdirSync(path.join(OUT_DIR, 'employers-by-name'), { recursive: true })
mkdirSync(path.join(OUT_DIR, 'employer-index'), { recursive: true })
writeFileSync(path.join(OUT_DIR, 'employer-head.json'), JSON.stringify(employerArtifacts.head))
for (const [shard, body] of Object.entries(employerArtifacts.index)) {
  writeFileSync(path.join(OUT_DIR, 'employer-index', `${shard}.json`), JSON.stringify(body))
}
for (const p of employerArtifacts.profiles) {
  writeFileSync(path.join(OUT_DIR, 'employers-by-name', `${p.slug}.json`), JSON.stringify(p))
}
console.log(`  prerendered ${employerArtifacts.stats.prerendered} employers ` +
  `(equivalent floor ${employerArtifacts.stats.equivalentFloor} filings), ` +
  `${employerArtifacts.stats.tail} searchable tail`)
const titlesJson = buildTitles(titleAgg, lcaPeriod)
writeFileSync(path.join(OUT_DIR, 'titles.json'), JSON.stringify(titlesJson))
writeFileSync(path.join(OUT_DIR, 'conflation.json'), JSON.stringify(buildConflation(conflationAgg, lcaPeriod)))
const lcaMatchedPostFilter = matched.filter(r => keepCbsa.has(r.cbsa)).length

// 6. Report
mkdirSync(REPORT_DIR, { recursive: true })
writeFileSync(path.join(REPORT_DIR, `run-${meta.generated.slice(0, 10)}.json`), JSON.stringify({
  generated: meta.generated, year, rppYear: meta.rppYear, topCodeValue: meta.topCodeValue,
  lcaPeriod: meta.lcaPeriod, sources: meta.sources,
  oewsFile: path.basename(oewsFile), lcaFiles,
  metros: meta.metros.length, metrosDroppedNoArea: droppedNoArea, metrosDroppedNoCoords: droppedNoCoords,
  salaryRows: salaries.length, salariesExcluded, employerFilesExcluded,
  lcaRaw: lcaRecords.length, lcaDrops, lcaDuplicateCaseNumbers: duplicateCaseNumbers,
  lcaUsable: dedupedLcaRecords.length, lcaMatched: matched.length, lcaMatchedPostFilter, lcaNonTargetSoc, zipMatchRate: matchRate,
  rppCoverage, employerFiles: employerFiles.length,
  titleMatchedTotal: titleAgg.matchedTotal,
  titleFamilyOverlapRate,
  titleBucketFilings: Object.fromEntries(
    titleAgg.families.flatMap(f => f.buckets.map(b => [`${f.key}/${b.key}`, b.national.filings]))),
  conflationTitles: conflationAgg.titles.length, conflationDistinctTitles: conflationAgg.distinctTitles,
  conflationTotalFilings: conflationAgg.totalFilings,
  topUnmatchedZips: [...unmatchedZips.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25),
  employerProfiles: employerProfiles.size,
  employerOutOfScopeFilings: employerOutOfScope,
  employerPrerendered: employerArtifacts.stats.prerendered,
  employerEquivalentFloor: employerArtifacts.stats.equivalentFloor,
  employerTail: employerArtifacts.stats.tail,
  employerAliasCollapse: collapse,
  employerAliasCoverage: coverage,
  employerMaxEntitySlug: biggest.slug,
  employerMaxEntityShare: biggest.share,
}, null, 2))
console.log(`DONE: ${meta.metros.length} metros, ${employerFiles.length} employer files -> ${OUT_DIR}`)
