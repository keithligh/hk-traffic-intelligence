export type MtrStationFix = { en: string; tc: string; lng: number; lat: number }

type LineStop = { code: string; en: string; tc: string }
type VenuePoint = { en: string; tc: string; lng: number; lat: number }

// Names and coordinates from the lines file and the station footprints.
// A short join leaves the stations already on the map.
export function mergeStationFix(
  current: Record<string, MtrStationFix>,
  lines: readonly LineStop[],
  venues: readonly VenuePoint[],
  minimum: number,
): Record<string, MtrStationFix> | null {
  if (lines.length === 0 || minimum <= 0) return null
  const byEnglish = new Map<string, VenuePoint>()
  const byChinese = new Map<string, VenuePoint>()
  for (const venue of venues) {
    byEnglish.set(normEn(venue.en), venue)
    byChinese.set(normZh(venue.tc), venue)
  }
  const next: Record<string, MtrStationFix> = { ...current }
  const lineCodes = new Set<string>()
  let located = 0
  for (const stop of lines) {
    lineCodes.add(stop.code)
    const hit = byEnglish.get(normEn(stop.en)) ?? byChinese.get(normZh(stop.tc))
    if (!hit) continue
    next[stop.code] = { en: stop.en, tc: stop.tc, lng: hit.lng, lat: hit.lat }
    located += 1
  }
  const racecourse = byEnglish.get("racecourse")
  if (racecourse) next.RAC = { en: "Racecourse", tc: "馬場", lng: racecourse.lng, lat: racecourse.lat }
  if (located < minimum) return null
  for (const code of Object.keys(next)) {
    if (code === "RAC") continue
    if (!lineCodes.has(code)) delete next[code]
  }
  if (Object.keys(next).length < minimum) return null
  return next
}

export function linesFromCsv(csv: string): LineStop[] {
  const rows = parseCsv(csv)
  const stops = new Map<string, LineStop>()
  for (const row of rows) {
    const code = row["Station Code"]?.trim()
    const en = row["English Name"]?.trim()
    const tc = row["Chinese Name"]?.normalize("NFKC").trim()
    if (!code || !en || !tc) continue
    stops.set(code, { code, en, tc })
  }
  return [...stops.values()]
}

export function venuesFromGeoJson(payload: unknown): VenuePoint[] {
  if (typeof payload !== "object" || payload === null || !("features" in payload)) return []
  const features = (payload as { features?: unknown }).features
  if (!Array.isArray(features)) return []
  const venues: VenuePoint[] = []
  for (const feature of features) {
    if (typeof feature !== "object" || feature === null) continue
    const record = feature as { geometry?: unknown; properties?: Record<string, unknown> }
    const point = centroid(record.geometry)
    if (!point) continue
    venues.push({
      en: text(record.properties?.venue_name_en),
      tc: text(record.properties?.venue_name_zh),
      lng: round(point.lng),
      lat: round(point.lat),
    })
  }
  return venues
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = []
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
  const header = splitCsv(lines[0] ?? "")
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const cells = splitCsv(line)
    const row: Record<string, string> = {}
    header.forEach((key, index) => {
      row[key] = cells[index] ?? ""
    })
    rows.push(row)
  }
  return rows
}

function splitCsv(line: string): string[] {
  const cells: string[] = []
  let current = ""
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (char === "," && !quoted) {
      cells.push(current)
      current = ""
      continue
    }
    current += char
  }
  cells.push(current)
  return cells
}

function centroid(geometry: unknown): { lng: number; lat: number } | null {
  if (typeof geometry !== "object" || geometry === null || !("type" in geometry)) return null
  const shape = geometry as { type?: string; coordinates?: number[][][] | number[][][][] }
  const ring = shape.type === "Polygon"
    ? shape.coordinates?.[0]
    : shape.type === "MultiPolygon"
      ? (shape.coordinates as number[][][][] | undefined)?.[0]?.[0]
      : null
  if (!ring?.length) return null
  let lng = 0
  let lat = 0
  for (const point of ring as number[][]) {
    lng += point[0] ?? 0
    lat += point[1] ?? 0
  }
  return { lng: lng / ring.length, lat: lat / ring.length }
}

function normEn(value: string): string {
  return value.toLowerCase().replace(/\bstation\b/g, "").replace(/[^a-z0-9]/g, "")
}

function normZh(value: string): string {
  return value.replace(/鐵路站$/, "").replace(/站$/, "").trim()
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
