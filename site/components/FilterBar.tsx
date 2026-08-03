'use client'
import type { Role } from '../lib/types'
import type { UrlState } from '../lib/url-state'

interface Props {
  roles: Role[]
  state: UrlState
  onChange: (patch: Partial<UrlState>) => void
}

export function FilterBar({ roles, state, onChange }: Props) {
  return (
    <div className="filter-bar">
      <label className="filter-field">
        <span className="filter-label" id="role-label">Role</span>
        <select aria-labelledby="role-label" aria-label="Role" value={state.role}
                onChange={e => onChange({ role: e.target.value })}>
          {roles.map(r => <option key={r.soc} value={r.soc}>{r.label}</option>)}
        </select>
      </label>
      <label className="filter-field">
        <span className="filter-label" id="metric-label">Color by</span>
        <select aria-labelledby="metric-label" aria-label="Color by" value={state.metric}
                onChange={e => onChange({ metric: e.target.value as UrlState['metric'] })}>
          <option value="pay">Median pay</option>
          <option value="emp">Employment</option>
          <option value="lq">Concentration (LQ)</option>
        </select>
      </label>
      <button type="button" className="col-toggle" aria-pressed={state.adjusted}
              onClick={() => onChange({ adjusted: !state.adjusted })}>
        Cost of living adjusted
      </button>
    </div>
  )
}
