import routesFile from "../../data/kmb-routes.json" with { type: "json" }
import { getRequestExecutionContext } from "vinext/shims/request-context"
import { catalogueAccepts } from "@/lib/stop-list"
import { readRouteStopList } from "@/lib/stop-routes"
import { fetchUpstream } from "@/lib/upstream"

const DAY_MS = 24 * 60 * 60 * 1000
const RETRY_MS = 60 * 60 * 1000
const LIST_URL = "https://data.etabus.gov.hk/v1/transport/kmb/route-stop"

type RouteFile = { stops: Record<string, string[]> }

const bundled = (routesFile as RouteFile).stops
const bundledCount = Object.keys(bundled).length
let routes = bundled
let nextTryAt = 0
let pending: Promise<void> | null = null

export function kmbRoutesAt(stopId: string): string[] {
  return routes[stopId] ?? []
}

export function kmbBundledRouteStopCount(): number {
  return bundledCount
}

export function replaceKmbRoutes(stops: Record<string, string[]>): boolean {
  const count = Object.keys(stops).length
  if (!catalogueAccepts(count, bundledCount)) return false
  routes = stops
  return true
}

// Route numbers stay with the stop. One route-stop read a day can pick up a reroute.
// The places answer waits for this read. A failed read leaves the routes already loaded.
export function refreshKmbRoutes(now = Date.now()): Promise<void> {
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
    const stops = readRouteStopList(payload, Math.floor(kmbBundledRouteStopCount() * 0.9))
    if (!stops || !replaceKmbRoutes(stops)) {
      nextTryAt = now + RETRY_MS
      return
    }
    nextTryAt = now + DAY_MS
  } catch {
    nextTryAt = now + RETRY_MS
  }
}
