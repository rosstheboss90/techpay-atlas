export interface Role { soc: string; label: string; short: string }

export const ROLES: Role[] = [
  { soc: '11-3021', label: 'Computer & Information Systems Managers', short: 'IT Mgr' },
  { soc: '15-1211', label: 'Computer Systems Analysts', short: 'Sys Analyst' },
  { soc: '15-1212', label: 'Information Security Analysts', short: 'Security' },
  { soc: '15-1221', label: 'Computer & Information Research Scientists', short: 'CS Research' },
  { soc: '15-1231', label: 'Computer Network Support Specialists', short: 'Net Support' },
  { soc: '15-1232', label: 'Computer User Support Specialists', short: 'User Support' },
  { soc: '15-1241', label: 'Computer Network Architects', short: 'Net Architect' },
  { soc: '15-1242', label: 'Database Administrators', short: 'DBA' },
  { soc: '15-1243', label: 'Database Architects', short: 'DB Architect' },
  { soc: '15-1244', label: 'Network & Computer Systems Administrators', short: 'Sysadmin' },
  { soc: '15-1251', label: 'Computer Programmers', short: 'Programmer' },
  { soc: '15-1252', label: 'Software Developers', short: 'SWE' },
  { soc: '15-1253', label: 'Software QA Analysts & Testers', short: 'QA' },
  { soc: '15-1254', label: 'Web Developers', short: 'Web Dev' },
  { soc: '15-1255', label: 'Web & Digital Interface Designers', short: 'UX/UI' },
  { soc: '15-1299', label: 'Computer Occupations, All Other', short: 'Other IT' },
  { soc: '15-2031', label: 'Operations Research Analysts', short: 'Ops Research' },
  { soc: '15-2041', label: 'Statisticians', short: 'Statistician' },
  { soc: '15-2051', label: 'Data Scientists', short: 'Data Sci' },
  { soc: '41-9031', label: 'Sales Engineers', short: 'Sales Eng' },
]

export const SOC_SET = new Set(ROLES.map(r => r.soc))

/** "15-1252.00" | " 15-1252 " -> "15-1252" if it is a target role, else null */
export function targetSoc(raw: unknown): string | null {
  const m = /(\d{2}-\d{4})/.exec(String(raw ?? ''))
  return m && SOC_SET.has(m[1]) ? m[1] : null
}
