import { getRequestExecutionContext } from "vinext/shims/request-context"
import { citybusRecords } from "@/lib/citybus-join"
import {
  citybusBundledStop,
  citybusBundledStopCount,
  patchCitybusStop,
  replaceCitybusStops,
} from "@/lib/citybus-network"
import { cycleStatus } from "@/lib/list-wait"
import { fetchUpstream } from "@/lib/upstream"

const DAY_MS = 24 * 60 * 60 * 1000
const RETRY_MS = 60 * 60 * 1000
const PACE_MS = 2_000
const ROOT = "https://rt.data.gov.hk/v2/transport/citybus"
const DIRS = ["inbound", "outbound"] as const

type Cycle = { listReady: boolean; refreshing: boolean }

type Walk = {
  routes: string[] | null
  index: number
  outbound: boolean
  members: Map<string, Set<string>>
  details: Map<string, { tc: string; en: string; lng: number; lat: number }>
  detailQueue: string[] | null
  detailAt: number
  failures: number
  replaced: boolean
  coordQueue: string[] | null
  coordAt: number
}

let nextTryAt = 0
let lastStepAt = 0
let published = false
let pending: Promise<Cycle> | null = null
let walk: Walk = freshWalk()

function freshWalk(): Walk {
  return {
    routes: null,
    index: 0,
    outbound: false,
    members: new Map(),
    details: new Map(),
    detailQueue: null,
    detailAt: 0,
    failures: 0,
    replaced: false,
    coordQueue: null,
    coordAt: 0,
  }
}

// One published call at a time, and never faster than one every two seconds.
// The saved stops stay on the map until every route has been read.
export function refreshCitybusStops(now = Date.now()): Promise<Cycle> {
  if (process.env.NODE_TEST_CONTEXT) return Promise.resolve({ listReady: true, refreshing: false })
  if (pending) return pending
  if (now < nextTryAt || (walk.routes && now < lastStepAt + PACE_MS)) return Promise.resolve(status(now))
  const task = step(now).finally(() => {
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

async function step(now: number): Promise<Cycle> {
  lastStepAt = now
  try {
    if (!walk.routes) return await loadRoutes(now)
    if (walk.index < walk.routes.length) return await loadRouteStop(now)
    if (!walk.detailQueue) walk.detailQueue = [...walk.members.keys()].filter((id) => !citybusBundledStop(id))
    if (walk.detailAt < walk.detailQueue.length) return await loadNewStop(now)
    if (!walk.replaced) return publishWalk(now)
    if (!walk.coordQueue) walk.coordQueue = [...walk.members.keys()].filter((id) => citybusBundledStop(id))
    if (walk.coordAt < walk.coordQueue.length) await refreshOneCoordinate()
    if ((walk.coordQueue?.length ?? 0) === 0 || walk.coordAt >= (walk.coordQueue?.length ?? 0)) return finishDay(now)
    return status(now)
  } catch {
    nextTryAt = now + RETRY_MS
    walk = freshWalk()
    return status(now)
  }
}

async function loadRoutes(now: number): Promise<Cycle> {
  const payload = await readJson(`${ROOT}/route/CTB`)
  const routes = routeNumbers(payload)
  if (routes.length === 0) {
    walk.failures += 1
    if (walk.failures >= 3) {
      nextTryAt = now + RETRY_MS
      walk = freshWalk()
      return status(now)
    }
    return status(now)
  }
  walk.routes = routes
  walk.failures = 0
  return status(now)
}

async function loadRouteStop(now: number): Promise<Cycle> {
  const route = walk.routes?.[walk.index] ?? ""
  const dir = walk.outbound ? DIRS[1] : DIRS[0]
  const payload = await readJson(`${ROOT}/route-stop/CTB/${encodeURIComponent(route)}/${dir}`)
  const ids = payload == null ? null : stopIds(payload)
  if (!ids) {
    walk.failures += 1
    if (walk.failures < 2) return status(now)
    walk.failures = 0
    advance()
    return status(now)
  }
  walk.failures = 0
  for (const id of ids) {
    const routes = walk.members.get(id) ?? new Set<string>()
    routes.add(route)
    walk.members.set(id, routes)
  }
  advance()
  return status(now)
}

function advance(): void {
  if (!walk.outbound) {
    walk.outbound = true
    return
  }
  walk.outbound = false
  walk.index += 1
}

async function loadNewStop(now: number): Promise<Cycle> {
  const id = walk.detailQueue?.[walk.detailAt] ?? ""
  const detail = await stopDetail(id)
  if (!detail) {
    walk.failures += 1
    if (walk.failures < 2) return status(now)
  } else {
    walk.details.set(id, detail)
  }
  walk.failures = 0
  walk.detailAt += 1
  return status(now)
}

function publishWalk(now: number): Cycle {
  const members = new Map<string, string[]>()
  for (const [id, routes] of walk.members) members.set(id, [...routes])
  const details: Record<string, { tc: string; en: string; lng: number; lat: number }> = {}
  for (const [id, detail] of walk.details) details[id] = detail
  const bundled: Record<string, { tc: string; en: string; lng: number; lat: number; routes: string[] }> = {}
  for (const id of members.keys()) {
    const known = citybusBundledStop(id)
    if (known) bundled[id] = known
  }
  const next = citybusRecords(members, bundled, details, Math.floor(citybusBundledStopCount() * 0.9))
  if (!next || !replaceCitybusStops(next)) {
    nextTryAt = now + RETRY_MS
    walk = freshWalk()
    return status(now)
  }
  published = true
  walk.replaced = true
  return status(now)
}

async function refreshOneCoordinate(): Promise<void> {
  const id = walk.coordQueue?.[walk.coordAt] ?? ""
  const detail = await stopDetail(id)
  if (detail) {
    const known = citybusBundledStop(id)
    if (!known || known.lng !== detail.lng || known.lat !== detail.lat || known.tc !== detail.tc || known.en !== detail.en) {
      patchCitybusStop(id, detail)
    }
  }
  walk.coordAt += 1
}

async function stopDetail(id: string): Promise<{ tc: string; en: string; lng: number; lat: number } | null> {
  const payload = await readJson(`${ROOT}/stop/${encodeURIComponent(id)}`)
  if (typeof payload !== "object" || payload === null || !("data" in payload)) return null
  const data = (payload as { data?: unknown }).data
  const record = Array.isArray(data) ? data[0] : data
  if (typeof record !== "object" || record === null) return null
  const row = record as { name_tc?: unknown; name_en?: unknown; lat?: unknown; long?: unknown }
  const lng = typeof row.long === "string" ? Number(row.long) : Number.NaN
  const lat = typeof row.lat === "string" ? Number(row.lat) : Number.NaN
  const tc = typeof row.name_tc === "string" ? row.name_tc.trim() : ""
  const en = typeof row.name_en === "string" ? row.name_en.trim() : ""
  if (!tc || !en || !Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { tc, en, lng, lat }
}

function finishDay(now: number): Cycle {
  nextTryAt = now + DAY_MS
  walk = freshWalk()
  return status(now)
}

function status(now: number): Cycle {
  return cycleStatus(now, nextTryAt, published, walk.replaced)
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

function routeNumbers(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null || !("data" in payload)) return []
  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  const routes: string[] = []
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue
    const route = (row as { route?: unknown }).route
    if (typeof route !== "string" || !route.trim() || seen.has(route)) continue
    seen.add(route)
    routes.push(route)
  }
  return routes
}

function stopIds(payload: unknown): string[] | null {
  if (typeof payload !== "object" || payload === null || !("data" in payload)) return null
  const data = (payload as { data?: unknown }).data
  if (data == null) return []
  if (!Array.isArray(data)) return null
  const ids: string[] = []
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue
    const stop = (row as { stop?: unknown }).stop
    if (typeof stop === "string" && stop.trim()) ids.push(stop)
  }
  return ids
}
