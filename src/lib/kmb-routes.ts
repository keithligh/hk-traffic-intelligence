import routesFile from "../../data/kmb-routes.json" with { type: "json" }
import { getRequestExecutionContext } from "vinext/shims/request-context"
import { catalogueAccepts } from "@/lib/stop-list"
import { readServiceVariants, serviceKey, type ServiceVariant } from "@/lib/route-variant"
import { readRouteBook, readRouteStopList, readStopHeadings, type StopHeading } from "@/lib/stop-routes"
import { fetchUpstream } from "@/lib/upstream"

const DAY_MS = 24 * 60 * 60 * 1000
const RETRY_MS = 60 * 60 * 1000
const LIST_URL = "https://data.etabus.gov.hk/v1/transport/kmb/route-stop"
const ROUTE_URL = "https://data.etabus.gov.hk/v1/transport/kmb/route"

type RouteFile = { stops: Record<string, string[]> }

const bundled = (routesFile as RouteFile).stops
const bundledCount = Object.keys(bundled).length
let routes = bundled
let headings: Record<string, StopHeading[]> = {}
let variantByKey = new Map<string, ServiceVariant>()
let variantByRoute = new Map<string, ServiceVariant[]>()
let variantAtStop: Record<string, string[]> = {}
let nextTryAt = 0
let pending: Promise<void> | null = null

export function kmbRoutesAt(stopId: string): string[] {
  return routes[stopId] ?? []
}

export function kmbHeadingsAt(stopId: string): StopHeading[] {
  return headings[stopId] ?? []
}

export function kmbVariantsAt(stopId: string): ServiceVariant[] {
  return (variantAtStop[stopId] ?? []).flatMap((key) => {
    const variant = variantByKey.get(key)
    return variant ? [variant] : []
  })
}

export function kmbVariantsFor(route: string): ServiceVariant[] {
  return variantByRoute.get(route) ?? []
}

export function kmbVariant(route: string, bound: string, service: string): ServiceVariant | null {
  return variantByKey.get(serviceKey(route, bound, service)) ?? null
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

const UPSTREAM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; HKTrafficIntelligence/1.0; +https://hktraffic.keith-li.workers.dev)",
}

async function run(now: number): Promise<void> {
  try {
    const [stopResponse, routeResponse] = await Promise.all([
      fetchUpstream(LIST_URL, DAY_MS, { timeoutMs: 30_000, headers: UPSTREAM_HEADERS }),
      fetchUpstream(ROUTE_URL, DAY_MS, { timeoutMs: 30_000, headers: UPSTREAM_HEADERS }),
    ])
    if (stopResponse.status !== 200) {
      nextTryAt = now + RETRY_MS
      return
    }
    const payload: unknown = JSON.parse(new TextDecoder().decode(stopResponse.body))
    const stops = readRouteStopList(payload, Math.floor(kmbBundledRouteStopCount() * 0.9))
    if (!stops || !replaceKmbRoutes(stops)) {
      nextTryAt = now + RETRY_MS
      return
    }
    const book = routeResponse.status === 200 ? readRouteBook(JSON.parse(new TextDecoder().decode(routeResponse.body))) : null
    const nextHeadings = book ? readStopHeadings(payload, book) : null
    if (nextHeadings) headings = nextHeadings
    const nextVariants = readServiceVariants(payload, book)
    if (nextVariants) {
      variantByKey = new Map(nextVariants.variants.map((item) => [item.key, item]))
      variantByRoute = new Map()
      for (const item of nextVariants.variants) {
        const list = variantByRoute.get(item.route) ?? []
        list.push(item)
        variantByRoute.set(item.route, list)
      }
      variantAtStop = nextVariants.atStop
    }
    nextTryAt = now + (nextHeadings ? DAY_MS : RETRY_MS)
  } catch {
    nextTryAt = now + RETRY_MS
  }
}
