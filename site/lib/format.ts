const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('en-US')

export const fmtUsd = (v: number | null | undefined): string => v == null ? '—' : usd.format(v)
export const fmtNum = (v: number | null | undefined): string => v == null ? '—' : num.format(v)
export function fmtUsdCompact(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  return `$${Math.round(v / 1000)}k`
}
