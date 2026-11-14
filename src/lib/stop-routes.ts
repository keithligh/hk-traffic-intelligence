export type RouteHeading = { destTc: string; destEn: string }
export type StopHeading = { route: string; destTc: string; destEn: string }

export function readRouteBook(payload: unknown): Map<string, RouteHeading> | null {
  const data = rowsOf(payload)
  if (!data) return null
  const book = new Map<string, RouteHeading>()
  const loose = new Map<string, RouteHeading | "mixed">()
  for (const record of data) {
    const route = text(record.route)
    const bound = text(record.bound).toUpperCase()
    const service = serviceText(record.service_type)
    const destTc = text(record.dest_tc)
    const destEn = text(record.dest_en)
    if (!route || !bound || (!destTc && !destEn)) continue
    const heading: RouteHeading = { destTc, destEn }
    book.set(routeKey(route, bound, service), heading)
    const shared = routeKey(route, bound, "")
    const previous = loose.get(shared)
    if (!previous) loose.set(shared, heading)
    else if (previous !== "mixed" && (previous.destTc !== destTc || previous.destEn !== destEn)) loose.set(shared, "mixed")
  }
  for (const [key, heading] of loose) {
    if (heading !== "mixed") book.set(key, heading)
  }
  return book.size > 0 ? book : null
}

export function routeHeading(book: ReadonlyMap<string, RouteHeading>, route: string, bound: string, service: string): RouteHeading | null {
  return book.get(routeKey(route, bound, service)) ?? book.get(routeKey(route, bound, "")) ?? null
}

export function readStopHeadings(payload: unknown, book: ReadonlyMap<string, RouteHeading>): Record<string, StopHeading[]> | null {
  const data = rowsOf(payload)
  if (!data) return null
  const grouped = new Map<string, Map<string, StopHeading>>()
  for (const record of data) {
    const stop = text(record.stop)
    const route = text(record.route)
    const bound = text(record.bound).toUpperCase()
    const service = serviceText(record.service_type)
    if (!stop || !route || !bound) continue
    const heading = routeHeading(book, route, bound, service)
    if (!heading) continue
    const byRoute = grouped.get(stop) ?? new Map<string, StopHeading>()
    const key = `${route}\n${heading.destTc}\n${heading.destEn}`
    if (!byRoute.has(key)) byRoute.set(key, { route, destTc: heading.destTc, destEn: heading.destEn })
    grouped.set(stop, byRoute)
  }
  if (grouped.size === 0) return null
  const stops: Record<string, StopHeading[]> = {}
  for (const [stop, byRoute] of grouped) {
    stops[stop] = [...byRoute.values()].sort((a, b) => a.route.localeCompare(b.route, undefined, { numeric: true }) || a.destTc.localeCompare(b.destTc, "zh-HK"))
  }
  return stops
}

function routeKey(route: string, bound: string, service: string): string {
  return `${route}\n${bound}\n${service}`
}

function rowsOf(payload: unknown): Record<string, unknown>[] | null {
  if (typeof payload !== "object" || payload === null || !("data" in payload)) return null
  const data = payload.data
  if (!Array.isArray(data)) return null
  return data.flatMap((row) => (typeof row === "object" && row !== null ? [row as Record<string, unknown>] : []))
}

export function readRouteStopList(payload: unknown, minimumStops: number): Record<string, string[]> | null {
  if (typeof payload !== "object" || payload === null || !("data" in payload)) return null
  const data = payload.data
  if (!Array.isArray(data)) return null
  const grouped = new Map<string, Set<string>>()
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue
    const record = row as Record<string, unknown>
    const stop = text(record.stop)
    const route = text(record.route)
    if (!stop || !route) continue
    const routes = grouped.get(stop) ?? new Set<string>()
    routes.add(route)
    grouped.set(stop, routes)
  }
  if (grouped.size < minimumStops) return null
  const stops: Record<string, string[]> = {}
  for (const [stop, routes] of grouped) {
    stops[stop] = [...routes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }
  return stops
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function serviceText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return text(value)
}

export function routesWithoutArrival(routes: readonly string[], arrived: readonly string[]): string[] {
  const seen = new Set(arrived.map((route) => route.trim()).filter(Boolean))
  const pending: string[] = []
  const listed = new Set<string>()
  for (const route of routes) {
    const trimmed = route.trim()
    if (!trimmed || seen.has(trimmed) || listed.has(trimmed)) continue
    listed.add(trimmed)
    pending.push(trimmed)
  }
  pending.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return pending
}
