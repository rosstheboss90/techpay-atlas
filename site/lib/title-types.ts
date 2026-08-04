// Mirrors docs/superpowers/specs/2026-08-03-title-lens-design.md "Site section"
// TitlesJson contract verbatim (site/public/data/titles.json).

export type Tier = 'base' | 'senior' | 'staffPlus' | 'lead' | 'directorPlus'

export interface TitleStats { filings: number; p25: number; median: number; p75: number }

export interface TitleBucket {
  key: string; label: string
  national: TitleStats
  metros: Record<string, TitleStats>              // only metros with filings >= 8
  tiers: Partial<Record<Tier, TitleStats>>          // national-only; present only with >= 25 filings
  socMix: { soc: string; share: number }[]          // top 4 + { soc: 'other' }, shares sum to 1
  topEmployers: { name: string; filings: number; median: number }[]
}

export interface TitleFamily { key: string; label: string; buckets: TitleBucket[] }

export interface TitlesJson { lcaPeriod: string; families: TitleFamily[] }

/** Tier ladder display order (base -> most senior). */
export const TIER_ORDER: { key: Tier; label: string }[] = [
  { key: 'base', label: 'Base' },
  { key: 'senior', label: 'Senior' },
  { key: 'staffPlus', label: 'Staff/Principal' },
  { key: 'lead', label: 'Lead' },
  { key: 'directorPlus', label: 'Director+' },
]
