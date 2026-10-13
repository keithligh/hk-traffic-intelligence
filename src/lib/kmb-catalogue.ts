import { getRequestExecutionContext } from "vinext/shims/request-context"
import { kmbBundledStopCount, replaceKmbCatalogue } from "@/lib/kmb-network"
import { readStopList } from "@/lib/stop-list"
import { fetchUpstream } from "@/lib/upstream"

const DAY_MS = 24 * 60 * 60 * 1000
const RETRY_MS = 60 * 60 * 1000
const LIST_URL = "https://data.etabus.gov.hk/v1/transport/kmb/stop"

let nextTryAt = 0
let pending: Promise<void> | null = null

// The published stop list is the map. The places answer waits for this read.
// A short or failed read leaves the poles already on the map.
export function refreshKmbCatalogue(now = Date.now()): Promise<void> {
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
    const response = await fetchUpstream(LIST_URL, DAY_MS, {
      timeoutMs: 30_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; HKTrafficIntelligence/1.0; +https://hktraffic.keith-li.workers.dev)",
      },
    })
    if (response.status !== 200) {
      nextTryAt = now + RETRY_MS
      return
    }
    const payload: unknown = JSON.parse(new TextDecoder().decode(response.body))
    const stops = readStopList(payload, Math.floor(kmbBundledStopCount() * 0.9))
    if (!stops || !replaceKmbCatalogue(stops)) {
      nextTryAt = now + RETRY_MS
      return
    }
    nextTryAt = now + DAY_MS
  } catch {
    nextTryAt = now + RETRY_MS
  }
}
