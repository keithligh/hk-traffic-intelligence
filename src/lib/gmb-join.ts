type StopFix = { tc: string; en: string; lng: number; lat: number }
type StopRecord = StopFix & { routes: string[]; ids: Record<string, string> }

export type GmbDirection = { routeId: string; seq: number; code: string }
export type GmbStopRow = { id: string; tc: string; en: string }
export type GmbMember = { tc: string; en: string; routes: readonly string[]; ids: Record<string, string> }

// Routes and names come from the route walk. Coordinates come from the saved stop, or from a stop document when the stop is new.
// The set is not ready while a new stop still has no coordinates.
export function gmbRecords(
  members: ReadonlyMap<string, GmbMember>,
  bundled: Record<string, StopRecord>,
  details: Record<string, { lng: number; lat: number }>,
  minimum: number,
): Record<string, StopRecord> | null {
  if (members.size < minimum) return null
  const next: Record<string, StopRecord> = {}
  for (const [id, member] of members) {
    const known = bundled[id]
    const detail = details[id]
    const lng = detail?.lng ?? known?.lng
    const lat = detail?.lat ?? known?.lat
    const tc = member.tc || known?.tc || ""
    const en = member.en || known?.en || ""
    if (!tc || !en || lng == null || lat == null || !Number.isFinite(lng) || !Number.isFinite(lat)) return null
    next[id] = {
      tc,
      en,
      lng,
      lat,
      routes: [...member.routes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      ids: { ...member.ids },
    }
  }
  if (Object.keys(next).length < minimum) return null
  return next
}

export function routeCodes(payload: unknown): string[] {
  if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.routes)) return []
  const seen = new Set<string>()
  const codes: string[] = []
  for (const route of payload.data.routes) {
    const code = idText(route)
    if (!code || seen.has(code)) continue
    seen.add(code)
    codes.push(code)
  }
  return codes
}

export function routeDirections(payload: unknown, fallbackCode: string): GmbDirection[] | null {
  if (!isRecord(payload) || !("data" in payload)) return null
  const data = payload.data
  if (data == null) return []
  if (!Array.isArray(data)) return null
  const directions: GmbDirection[] = []
  for (const variant of data) {
    if (!isRecord(variant)) continue
    const routeId = idText(variant.route_id)
    const code = text(variant.route_code) || fallbackCode
    if (!routeId || !code || !Array.isArray(variant.directions)) continue
    for (const direction of variant.directions) {
      if (!isRecord(direction)) continue
      const seq = typeof direction.route_seq === "number" ? direction.route_seq : Number.NaN
      if (!Number.isInteger(seq)) continue
      directions.push({ routeId, seq, code })
    }
  }
  return directions
}

export function routeStops(payload: unknown): GmbStopRow[] | null {
  if (!isRecord(payload) || !("data" in payload)) return null
  const data = payload.data
  if (data == null) return []
  if (!isRecord(data) || !("route_stops" in data)) return null
  const rows = data.route_stops
  if (rows == null) return []
  if (!Array.isArray(rows)) return null
  const stops: GmbStopRow[] = []
  for (const row of rows) {
    if (!isRecord(row)) continue
    const id = idText(row.stop_id)
    if (!id) continue
    stops.push({ id, tc: text(row.name_tc), en: text(row.name_en) })
  }
  return stops
}

export function stopPoint(payload: unknown): { lng: number; lat: number } | "disabled" | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null
  if (payload.data.enabled === false) return "disabled"
  if (!isRecord(payload.data.coordinates) || !isRecord(payload.data.coordinates.wgs84)) return null
  const lng = coordinate(payload.data.coordinates.wgs84.longitude, 113, 115)
  const lat = coordinate(payload.data.coordinates.wgs84.latitude, 22, 23)
  if (lng == null || lat == null) return null
  return { lng, lat }
}

function coordinate(value: unknown, low: number, high: number): number | null {
  const parsed = typeof value === "number" ? value : Number.NaN
  if (!Number.isFinite(parsed) || parsed < low || parsed > high) return null
  return parsed
}

function idText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return text(value)
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
