import type { Metric } from './types'

export interface UrlState { role: string; metric: Metric; adjusted: boolean; metro: string | null; vs: string | null }

export const DEFAULT_STATE: UrlState = { role: '15-1252', metric: 'pay', adjusted: false, metro: null, vs: null }

const METRICS = new Set<Metric>(['pay', 'emp', 'lq'])
const SOC_RE = /^\d{2}-\d{4}$/

export function parseState(q: URLSearchParams): UrlState {
  const role = q.get('role') ?? ''
  const metric = q.get('metric') as Metric
  const metro = q.get('metro') ?? ''
  const vs = q.get('vs') ?? ''
  return {
    // Shape-only: the real membership gate is the page checking against meta.roles,
    // so new roles (e.g. 13-1082) don't need an allowlist edit here.
    role: SOC_RE.test(role) ? role : DEFAULT_STATE.role,
    metric: METRICS.has(metric) ? metric : DEFAULT_STATE.metric,
    adjusted: q.get('adj') === '1',
    metro: /^\d{5}$/.test(metro) ? metro : null,
    vs: /^\d{5}$/.test(vs) ? vs : null,   // head-to-head compare metro (metro B)
  }
}

export function serializeState(s: UrlState): string {
  const q = new URLSearchParams()
  if (s.role !== DEFAULT_STATE.role) q.set('role', s.role)
  if (s.metric !== DEFAULT_STATE.metric) q.set('metric', s.metric)
  if (s.adjusted) q.set('adj', '1')
  if (s.metro) q.set('metro', s.metro)
  if (s.vs) q.set('vs', s.vs)
  return q.toString()
}
