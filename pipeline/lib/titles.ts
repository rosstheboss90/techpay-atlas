export interface TitleBucketDef { key: string; label: string; re: RegExp }
export interface TitleFamily { key: string; label: string; buckets: TitleBucketDef[] }
export type Tier = 'base' | 'senior' | 'staffPlus' | 'lead' | 'directorPlus'

// Ordering matters: specific (technical) before generic; first match within a family wins.
export const FAMILIES: TitleFamily[] = [
  { key: 'pm', label: 'PM & Product', buckets: [
    { key: 'tpm', label: 'Technical Program Manager', re: /\bTECHNICAL\s+PROGRAM\s+MANAGER\b|\bTECHNICAL\s+PROGRAMS?\b.*\bMANAGER\b|\bMANAGER\b.*\bTECHNICAL\s+PROGRAMS?\b/ },
    { key: 'techProjectMgr', label: 'Technical Project Manager', re: /\bTECHNICAL\s+PROJECT\s+MANAGER\b/ },
    { key: 'techProductMgr', label: 'Technical Product Manager', re: /\bTECHNICAL\s+PRODUCT\s+MANAGER\b/ },
    { key: 'productOwner', label: 'Product Owner', re: /\bPRODUCT\s+OWNER\b/ },
    { key: 'productMgr', label: 'Product Manager', re: /\bPRODUCT\s+MANAGER\b/ },
    { key: 'programMgr', label: 'Program Manager', re: /\bPROGRAM\s+MANAGER\b/ },
    { key: 'projectMgr', label: 'Project Manager', re: /\bPROJECT\s+MANAGER\b/ },
    { key: 'pmo', label: 'PMO', re: /\bPMO\b/ },
  ]},
  { key: 'platform', label: 'Platform & Ops', buckets: [
    { key: 'devops', label: 'DevOps Engineer', re: /\bDEV\s?OPS\b/ },
    { key: 'sre', label: 'Site Reliability Engineer', re: /\bSITE\s+RELIABILITY\b|\bSRE\b/ },
    { key: 'platformEng', label: 'Platform Engineer', re: /\bPLATFORM\s+ENGINEER\b/ },
    { key: 'cloudEng', label: 'Cloud Engineer', re: /\bCLOUD\s+ENGINEER\b/ },
    { key: 'infraEng', label: 'Infrastructure Engineer', re: /\bINFRASTRUCTURE\s+ENGINEER\b/ },
  ]},
  { key: 'data', label: 'Data', buckets: [
    { key: 'dataEng', label: 'Data Engineer', re: /\bDATA\s+ENGINEER\b/ },
    { key: 'mlEng', label: 'ML Engineer', re: /\b(MACHINE\s+LEARNING|ML)\s+ENGINEER\b/ },
    { key: 'analyticsEng', label: 'Analytics Engineer', re: /\bANALYTICS\s+ENGINEER\b/ },
    { key: 'dataAnalyst', label: 'Data Analyst', re: /\bDATA\s+ANALYST\b/ },
  ]},
  { key: 'dev', label: 'Dev Specialization', buckets: [
    { key: 'frontend', label: 'Frontend Engineer', re: /\bFRONT[\s-]?END\b/ },
    { key: 'backend', label: 'Backend Engineer', re: /\bBACK[\s-]?END\b/ },
    { key: 'fullstack', label: 'Full-stack Engineer', re: /\bFULL[\s-]?STACK\b/ },
    { key: 'mobile', label: 'Mobile Engineer', re: /\b(IOS|ANDROID)\b.*\b(ENGINEER|DEVELOPER)\b|\bMOBILE\s+(SOFTWARE\s+)?(ENGINEER|DEVELOPER)\b/ },
  ]},
]

/** First matching bucket across families (families are disjoint by test). Null = not a lens title. */
export function bucketFor(title: string): TitleBucketDef | null {
  for (const f of FAMILIES) for (const b of f.buckets) if (b.re.test(title)) return b
  return null
}

const TIER_RES: [Tier, RegExp][] = [
  ['directorPlus', /\b(DIRECTOR|VP|VICE\s+PRESIDENT)\b/],
  ['lead', /\b(LEAD|HEAD\s+OF)\b/],
  ['staffPlus', /\b(STAFF|PRINCIPAL|DISTINGUISHED)\b/],
  ['senior', /\b(SENIOR|SR\.?)\b|\bI{3}\b|\bIV\b/],
]

// Financial-services "VP"/"VICE PRESIDENT" (unlike DIRECTOR) is often an IC rank rather than
// people-management (e.g. "VICE PRESIDENT, LEAD SITE RELIABILITY ENGINEER"). A directorPlus
// match is demoted to 'lead' when it came from VP/VICE PRESIDENT — never from DIRECTOR itself —
// and the title also carries an IC marker (LEAD, or a roman-numeral level suffix) or opens
// with ASSISTANT (ASSISTANT VICE PRESIDENT ranks below VP).
const VP_RE = /\b(VP|VICE\s+PRESIDENT)\b/
const IC_MARKER_RE = /\b(LEAD|I{1,3}|IV|V)\b/

export function parseSeniority(title: string): Tier {
  for (const [tier, re] of TIER_RES) {
    if (!re.test(title)) continue
    const isIcVp = tier === 'directorPlus' && !/\bDIRECTOR\b/.test(title) && VP_RE.test(title)
      && (IC_MARKER_RE.test(title) || /^ASSISTANT\b/.test(title))
    return isIcVp ? 'lead' : tier
  }
  return 'base'
}
