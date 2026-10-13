import { getRequestExecutionContext } from "vinext/shims/request-context"
import { gmbRecords, routeCodes, routeDirections, routeStops, stopPoint, type GmbDirection } from "@/lib/gmb-join"
import { dropGmbStop, gmbBundledStop, gmbBundledStopCount, gmbStop, patchGmbStop, replaceGmbStops } from "@/lib/gmb-reach"
import { fetchUpstream } from "@/lib/upstream"

const DAY_MS = 24 * 60 * 60 * 1000
const RETRY_MS = 60 * 60 * 1000
const PACE_MS = 2_000
const ROOT = "https://data.etagmb.gov.hk"
const REGIONS = ["HKI", "KLN", "NT"] as const

type Read = { kind: "ok"; payload: unknown } | { kind: "refusal" } | { kind: "miss" }

type Member = { tc: string; en: string; routes: Set<string>; ids: Record<string, string> }

type Walk = {
  regionAt: number
  jobs: { region: string; code: string }[]
  routesReady: boolean
  index: number
  dirs: GmbDirection[] | null
  dirAt: number
  members: Map<string, Member>
  details: Map<string, { lng: number; lat: number }>
  detailQueue: string[] | null
  detailAt: number
  failures: number
  replaced: boolean
  coordQueue: string[] | null
  coordAt: number
}

let nextTryAt = 0
let lastStepAt = 0
let pending: Promise<boolean> | null = null
let walk: Walk = freshWalk()

function freshWalk(): Walk {
  return {
    regionAt: 0,
    jobs: [],
    routesReady: false,
    index: 0,
    dirs: null,
    dirAt: 0,
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
// A refused call pauses the walk and keeps the routes already read.
export function refreshGmbStops(now = Date.now()): Promise<boolean> {
  if (process.env.NODE_TEST_CONTEXT) return Promise.resolve(true)
  if (now < nextTryAt) return Promise.resolve(true)
  if (pending) return pending
  if (lastStepAt !== 0 && now < lastStepAt + PACE_MS) return Promise.resolve(walk.replaced)
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

async function step(now: number): Promise<boolean> {
  lastStepAt = now
  if (!walk.routesReady) return loadRegion(now)
  if (walk.index < walk.jobs.length) return loadRoute(now)
  if (!walk.detailQueue) walk.detailQueue = [...walk.members.keys()].filter((id) => !gmbBundledStop(id))
  if (walk.detailAt < walk.detailQueue.length) return loadNewStop(now)
  if (!walk.replaced) return publishWalk(now)
  if (!walk.coordQueue) walk.coordQueue = [...walk.members.keys()].filter((id) => gmbBundledStop(id))
  if (walk.coordAt < walk.coordQueue.length) return refreshOneCoordinate(now)
  nextTryAt = now + DAY_MS
  return true
}

async function loadRegion(now: number): Promise<boolean> {
  const region = REGIONS[walk.regionAt] ?? REGIONS[0]
  const read = await readJson(`${ROOT}/route/${region}`)
  if (read.kind === "refusal") return refuse(now)
  const codes = read.kind === "ok" ? routeCodes(read.payload) : []
  if (read.kind === "miss" || codes.length === 0) {
    walk.failures += 1
    if (walk.failures >= 3) return giveUp(now)
    return false
  }
  walk.failures = 0
  for (const code of codes) walk.jobs.push({ region, code })
  walk.regionAt += 1
  if (walk.regionAt >= REGIONS.length) walk.routesReady = true
  return false
}

async function loadRoute(now: number): Promise<boolean> {
  if (!walk.dirs) return loadRouteDetail(now)
  if (walk.dirAt >= walk.dirs.length) {
    skipRoute()
    return false
  }
  return loadRouteStop(now)
}

async function loadRouteDetail(now: number): Promise<boolean> {
  const job = walk.jobs[walk.index]
  if (!job) {
    skipRoute()
    return false
  }
  const read = await readJson(`${ROOT}/route/${job.region}/${encodeURIComponent(job.code)}`)
  if (read.kind === "refusal") return refuse(now)
  const dirs = read.kind === "ok" ? routeDirections(read.payload, job.code) : null
  if (!dirs) return failRoute()
  walk.failures = 0
  walk.dirs = dirs
  walk.dirAt = 0
  if (dirs.length === 0) skipRoute()
  return false
}

async function loadRouteStop(now: number): Promise<boolean> {
  const dir = walk.dirs?.[walk.dirAt]
  if (!dir) {
    skipRoute()
    return false
  }
  const read = await readJson(`${ROOT}/route-stop/${encodeURIComponent(dir.routeId)}/${dir.seq}`)
  if (read.kind === "refusal") return refuse(now)
  const rows = read.kind === "ok" ? routeStops(read.payload) : null
  if (!rows) return failDirection()
  walk.failures = 0
  for (const row of rows) remember(row.id, row.tc, row.en, dir.routeId, dir.code)
  walk.dirAt += 1
  if (walk.dirAt >= (walk.dirs?.length ?? 0)) skipRoute()
  return false
}

async function loadNewStop(now: number): Promise<boolean> {
  const id = walk.detailQueue?.[walk.detailAt] ?? ""
  const read = await readJson(`${ROOT}/stop/${encodeURIComponent(id)}`)
  if (read.kind === "refusal") return refuse(now)
  if (read.kind === "miss") return failDetail()
  const point = stopPoint(read.payload)
  if (point === "disabled") {
    walk.members.delete(id)
    return advanceDetail()
  }
  if (!point) return failDetail()
  walk.details.set(id, point)
  return advanceDetail()
}

function publishWalk(now: number): boolean {
  for (const id of [...walk.members.keys()]) {
    const member = walk.members.get(id)
    if (!member) continue
    const known = gmbBundledStop(id)
    const detail = walk.details.get(id)
    const lng = detail?.lng ?? known?.lng
    const lat = detail?.lat ?? known?.lat
    const tc = member.tc || known?.tc || ""
    const en = member.en || known?.en || ""
    if (!tc || !en || lng == null || lat == null || !Number.isFinite(lng) || !Number.isFinite(lat)) walk.members.delete(id)
  }
  const members = new Map<string, { tc: string; en: string; routes: string[]; ids: Record<string, string> }>()
  for (const [id, member] of walk.members) members.set(id, { tc: member.tc, en: member.en, routes: [...member.routes], ids: member.ids })
  const details: Record<string, { lng: number; lat: number }> = {}
  for (const [id, detail] of walk.details) details[id] = detail
  const bundled: Record<string, { tc: string; en: string; lng: number; lat: number; routes: string[]; ids: Record<string, string> }> = {}
  for (const id of members.keys()) {
    const known = gmbBundledStop(id)
    if (known) bundled[id] = known
  }
  const next = gmbRecords(members, bundled, details, Math.floor(gmbBundledStopCount() * 0.9))
  if (!next || !replaceGmbStops(next)) return giveUp(now)
  walk.replaced = true
  return true
}

async function refreshOneCoordinate(now: number): Promise<boolean> {
  const id = walk.coordQueue?.[walk.coordAt] ?? ""
  const read = await readJson(`${ROOT}/stop/${encodeURIComponent(id)}`)
  if (read.kind === "refusal") return refuse(now)
  if (read.kind === "ok") {
    const point = stopPoint(read.payload)
    if (point === "disabled") dropGmbStop(id)
    else if (point) {
      const known = gmbStop(id)
      if (known && (known.lng !== point.lng || known.lat !== point.lat)) {
        patchGmbStop(id, { tc: known.tc, en: known.en, lng: point.lng, lat: point.lat })
      }
    }
  }
  walk.coordAt += 1
  if (walk.coordAt >= (walk.coordQueue?.length ?? 0)) nextTryAt = now + DAY_MS
  return true
}

function remember(id: string, tc: string, en: string, routeId: string, code: string): void {
  const current = walk.members.get(id) ?? { tc: "", en: "", routes: new Set<string>(), ids: {} }
  if (tc) current.tc = current.tc || tc
  if (en) current.en = current.en || en
  current.routes.add(code)
  current.ids[routeId] = code
  walk.members.set(id, current)
}

function failRoute(): boolean {
  walk.failures += 1
  if (walk.failures < 2) return false
  skipRoute()
  return false
}

function failDirection(): boolean {
  walk.failures += 1
  if (walk.failures < 2) return false
  walk.failures = 0
  walk.dirAt += 1
  if (walk.dirAt >= (walk.dirs?.length ?? 0)) skipRoute()
  return false
}

function failDetail(): boolean {
  walk.failures += 1
  if (walk.failures < 2) return false
  return advanceDetail()
}

function advanceDetail(): boolean {
  walk.failures = 0
  walk.detailAt += 1
  return false
}

function skipRoute(): void {
  walk.failures = 0
  walk.dirs = null
  walk.dirAt = 0
  walk.index += 1
}

function refuse(now: number): boolean {
  nextTryAt = now + RETRY_MS
  return true
}

function giveUp(now: number): boolean {
  nextTryAt = now + RETRY_MS
  walk = freshWalk()
  return true
}

async function readJson(url: string): Promise<Read> {
  try {
    const response = await fetchUpstream(url, DAY_MS, {
      timeoutMs: 12_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; HKTrafficIntelligence/1.0; +https://hktraffic.keith-li.workers.dev)",
      },
    })
    if (response.status === 403 || response.status === 429) return { kind: "refusal" }
    if (response.status !== 200) return { kind: "miss" }
    return { kind: "ok", payload: JSON.parse(new TextDecoder().decode(response.body)) }
  } catch {
    return { kind: "miss" }
  }
}
