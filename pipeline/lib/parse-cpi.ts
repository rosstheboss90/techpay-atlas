// Pure parser for the BLS Public API v1 timeseries response (api.bls.gov). No I/O: it takes the
// already-parsed response object, so it is unit-testable without a network call. The flat-file
// host (download.bls.gov) is Akamai-blocked; api.bls.gov is a separate, reachable host and
// returns structured JSON instead of a ~20MB space-padded fixed-width text file.

export interface BlsObservation {
  year: string
  period: string
  periodName: string
  value: string
  footnotes: unknown[]
}

export interface BlsSeries {
  seriesID: string
  data: BlsObservation[]
}

export interface BlsTimeseriesResponse {
  status: string
  message?: string[]
  Results?: { series: BlsSeries[] }
}

// Strict shape check before Number() so permissive parsing (scientific notation, stray
// whitespace-only strings, etc.) can't sneak an unintended value through — same reasoning as
// pipeline/lib/num.ts. BLS writes the literal string "-" for an observation it could not
// publish (e.g. the 2025 appropriations lapse skipped October); that must throw, not become 0.
const NUM_RE = /^-?\d+(\.\d+)?$/

/** May-only CPI-U index values for `seriesId`, keyed by year. BLS's OEWS survey reference period
 *  is May, so a May-to-May deflator needs no interpolation between months — this throws away
 *  every other month rather than the caller having to remember to filter.
 *
 *  Throws instead of coercing on anything that would otherwise produce a wrong or silently short
 *  deflator: a non-success API status, a missing series, an unparseable observation value, or
 *  zero May observations found at all. */
export function parseCpiMayByYear(response: BlsTimeseriesResponse, seriesId: string): Record<number, number> {
  if (response.status !== 'REQUEST_SUCCEEDED') {
    throw new Error(
      `BLS API request did not succeed (status=${response.status}): ${JSON.stringify(response.message ?? [])}`,
    )
  }
  const series = response.Results?.series.find(s => s.seriesID === seriesId)
  if (!series) {
    throw new Error(`series ${seriesId} not present in BLS response (Results.series has ${response.Results?.series.map(s => s.seriesID).join(', ') ?? 'nothing'})`)
  }
  const out: Record<number, number> = {}
  for (const obs of series.data) {
    if (obs.period === 'M13') continue // annual average, not a month
    if (obs.period !== 'M05') continue
    const raw = obs.value.trim()
    if (!NUM_RE.test(raw)) {
      throw new Error(
        `CPI value "${obs.value}" for ${obs.year} ${obs.period} is not a parseable number ` +
        `(BLS writes "-" for an observation it could not publish, e.g. an appropriations lapse)`,
      )
    }
    out[Number(obs.year)] = Number(raw)
  }
  if (Object.keys(out).length === 0) {
    throw new Error(`no May (M05) observations found for series ${seriesId}`)
  }
  return out
}
