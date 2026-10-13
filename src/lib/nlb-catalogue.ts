import { getRequestExecutionContext } from "vinext/shims/request-context"
import { addNlbRouteStops, nlbStopRecord } from "@/lib/nlb-join"
import { nlbBundledStopCount, replaceNlbStops } from "@/lib/nlb-network"
import { fetchUpstream } from "@/lib/upstream"

const DAY_MS = 24 * 60 * 60 * 1000
const RETRY_MS = 60 * 60 * 1000
const GAP_MS = 80
const ROOT = "https://rt.data.gov.hk/v2/transport/nlb"

let nextTryAt = 0
let pending: Promise<void> | null = null

// The published stop list is a walk of every route. The map answers with the stops
// already loaded, and this walk keeps going. A short walk does not replace them.
export function refreshNlbStops(now = Date.now()): Promise<void> {
  if (process.env.NODE_TEST_CONTEXT) return Promise.resolve()
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
    const listed = await readJson(`${ROOT}/route.php?action=list`)
    const routes = routesOf(listed)
    if (routes.length === 0) {
      nextTryAt = now + RETRY_MS
      return
    }
    const stops = new Map()
    for (const route of routes) {
      const board = await readJson(`${ROOT}/stop.php?action=list&routeId=${encodeURIComponent(route.id)}`)
      const rows = stopsOf(board)
      if (!rows) {
        nextTryAt = now + RETRY_MS
        return
      }
      addNlbRouteStops(stops, route.id, route.code, rows)
      await new Promise((resolve) => setTimeout(resolve, GAP_MS))
    }
    const minimum = Math.floor(nlbBundledStopCount() * 0.9)
    const next = nlbStopRecord(stops)
    if (Object.keys(next).length < minimum || !replaceNlbStops(next)) {
      nextTryAt = now + RETRY_MS
      return
    }
    nextTryAt = now + DAY_MS
  } catch {
    nextTryAt = now + RETRY_MS
  }
}

async function readJson(url: string): Promise<unknown | null> {
  const response = await fetchUpstream(url, DAY_MS, {
    timeoutMs: 12_000,
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; HKTrafficIntelligence/1.0; +https://hktraffic.keith-li.workers.dev)",
    },
  })
  if (response.status !== 200) return null
  try {
    return JSON.parse(new TextDecoder().decode(response.body))
  } catch {
    return null
  }
}

function routesOf(payload: unknown): { id: string; code: string }[] {
  if (typeof payload !== "object" || payload === null || !("routes" in payload)) return []
  const routes = (payload as { routes?: unknown }).routes
  if (!Array.isArray(routes)) return []
  const listed: { id: string; code: string }[] = []
  for (const route of routes) {
    if (typeof route !== "object" || route === null) continue
    const record = route as { routeId?: unknown; routeNo?: unknown }
    const id = typeof record.routeId === "string" || typeof record.routeId === "number" ? String(record.routeId) : ""
    const code = typeof record.routeNo === "string" ? record.routeNo.trim() : ""
    if (!id || !code) continue
    listed.push({ id, code })
  }
  return listed
}

function stopsOf(payload: unknown): { stopId?: unknown; longitude?: unknown; latitude?: unknown; stopName_c?: unknown; stopName_e?: unknown }[] | null {
  if (typeof payload !== "object" || payload === null || !("stops" in payload)) return null
  const stops = (payload as { stops?: unknown }).stops
  if (!Array.isArray(stops)) return null
  return stops as { stopId?: unknown; longitude?: unknown; latitude?: unknown; stopName_c?: unknown; stopName_e?: unknown }[]
}
