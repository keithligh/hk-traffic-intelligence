export type NlbJoinedStop = {
  tc: string
  en: string
  lng: number
  lat: number
  routes: string[]
  services: { id: string; code: string }[]
}

type StopRow = {
  stopId?: unknown
  longitude?: unknown
  latitude?: unknown
  stopName_c?: unknown
  stopName_e?: unknown
}

// One route's stops join the set. A stop used by two routes keeps both route numbers.
export function addNlbRouteStops(
  stops: Map<string, NlbJoinedStop>,
  routeId: string,
  code: string,
  rows: readonly StopRow[],
): void {
  for (const row of rows) {
    const id = text(row.stopId)
    const lng = number(row.longitude)
    const lat = number(row.latitude)
    if (!id || lng == null || lat == null) continue
    const current = stops.get(id) ?? {
      tc: text(row.stopName_c),
      en: text(row.stopName_e),
      lng,
      lat,
      routes: [],
      services: [],
    }
    if (!current.routes.includes(code)) current.routes.push(code)
    if (!current.services.some((service) => service.id === routeId)) current.services.push({ id: routeId, code })
    stops.set(id, current)
  }
}

export function nlbStopRecord(stops: ReadonlyMap<string, NlbJoinedStop>): Record<string, NlbJoinedStop> {
  const records: Record<string, NlbJoinedStop> = {}
  for (const [id, stop] of stops) {
    records[id] = {
      ...stop,
      routes: [...stop.routes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    }
  }
  return records
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : ""
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) return null
  return parsed
}
