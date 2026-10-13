import { getRequestExecutionContext } from "vinext/shims/request-context"
import { linesFromCsv, mergeStationFix, venuesFromGeoJson } from "@/lib/mtr-join"
import { mtrBundledStationCount, mtrStationRecords, replaceMtrStations } from "@/lib/mtr-network"
import { fetchUpstream } from "@/lib/upstream"

const DAY_MS = 24 * 60 * 60 * 1000
const RETRY_MS = 60 * 60 * 1000
const LINES_URL = "https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv"
const VENUES_URL = "https://mapapi.hkmapservice.gov.hk/ogc/wfs/indoor/mtr_venue_polygon?service=WFS&version=1.1.0&request=GetFeature&outputFormat=application/json"

let nextTryAt = 0
let pending: Promise<void> | null = null

// The published station list is the map. A short or failed read leaves the stations already shown.
export function refreshMtrStations(now = Date.now()): Promise<void> {
  if (pending) return pending
  if (now < nextTryAt) return Promise.resolve()
  const task = run(now).finally(() => {
    pending = null
  })
  pending = task
  try {
    getRequestExecutionContext()?.waitUntil(task)
  } catch {
    // Outside the worker there is no request context. The promise still runs here.
  }
  return task
}

async function run(now: number): Promise<void> {
  try {
    const [linesResponse, venuesResponse] = await Promise.all([
      fetchUpstream(LINES_URL, DAY_MS, { timeoutMs: 20_000, headers: { Accept: "text/csv" } }),
      fetchUpstream(VENUES_URL, DAY_MS, { timeoutMs: 20_000, headers: { Accept: "application/json" } }),
    ])
    if (linesResponse.status !== 200 || venuesResponse.status !== 200) {
      nextTryAt = now + RETRY_MS
      return
    }
    const lines = linesFromCsv(new TextDecoder().decode(linesResponse.body))
    const venues = venuesFromGeoJson(JSON.parse(new TextDecoder().decode(venuesResponse.body)))
    const next = mergeStationFix(mtrStationRecords(), lines, venues, Math.floor(mtrBundledStationCount() * 0.9))
    if (!next || !replaceMtrStations(next)) {
      nextTryAt = now + RETRY_MS
      return
    }
    nextTryAt = now + DAY_MS
  } catch {
    nextTryAt = now + RETRY_MS
  }
}
