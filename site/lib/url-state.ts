import type { Metric } from './types'

export interface UrlState { role: string; metric: Metric; adjusted: boolean; metro: string | null }

export const DEFAULT_STATE: UrlState = { role: '15-1252', metric: 'pay', adjusted: false, metro: null }

const METRICS = new Set<Metric>(['pay', 'emp', 'lq'])
const SOC_RE = /^\d{2}-\d{4}$/

export function parseState(q: URLSearchParams): UrlState {
  const role = q.get('role') ?? ''
  const metric = q.get('metric') as Metric
  const metro = q.get('metro') ?? ''
  return {
    role: SOC_RE.test(role) && role.startsWith('15-') || role === '11-3021' || role === '41-9031' ? role : DEFAULT_STATE.role,
    metric: METRICS.has(metric) ? metric : DEFAULT_STATE.metric,
    adjusted: q.get('adj') === '1',
    metro: /^\d{5}$/.test(metro) ? metro : null,
  }
}

export function serializeState(s: UrlState): string {
  const q = new URLSearchParams()
  if (s.role !== DEFAULT_STATE.role) q.set('role', s.role)
  if (s.metric !== DEFAULT_STATE.metric) q.set('metric', s.metric)
  if (s.adjusted) q.set('adj', '1')
  if (s.metro) q.set('metro', s.metro)
  return q.toString()
}
