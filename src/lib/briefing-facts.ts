import type { ApproachPoint, Corridor, SpeedSummary, WeatherConditions } from "./types.ts"

// The plain facts an AI briefing is written from. Small on purpose: the model
// should restate what the feeds say, not infer from raw segments.

export type BriefingInput = {
  at: Date
  traffic: { ok: boolean; corridors: Corridor[]; summary: SpeedSummary } | null
  crossings: { code: string; minutes: number }[]
  incidents: { tc: string; en: string; whereTc: string; whereEn: string }[]
  warnings: { name: string }[]
  conditions: WeatherConditions | null
}

export type JammedRoad = { tc: string; en: string; km: number; slowestKmh: number }

const TUNNEL: Record<string, string> = {
  CH: "Cross-Harbour Tunnel (紅隧)",
  EH: "Eastern Harbour Crossing (東隧)",
  WH: "Western Harbour Crossing (西隧)",
}

// Below this a "jam" is usually one short segment at a junction.
const MIN_JAM_KM = 0.5
// The feed sometimes grades a segment congested while it reads 84 km/h; that is not a jam.
const MAX_JAM_KMH = 40
const HK_OFFSET_MS = 8 * 3_600_000

// Each tunnel's fastest published time from any start. Kept here rather than in crossings.ts,
// which upstream reshapes around the sign nearest the map.
export function fastestCrossings(points: ApproachPoint[]): { code: string; minutes: number }[] {
  const best = new Map<string, number>()
  for (const point of points) {
    for (const leg of point.legs) {
      if (leg.minutes == null || !(leg.code in TUNNEL)) continue
      best.set(leg.code, Math.min(best.get(leg.code) ?? Infinity, leg.minutes))
    }
  }
  return Object.keys(TUNNEL).flatMap((code) => {
    const minutes = best.get(code)
    return minutes == null ? [] : [{ code, minutes }]
  })
}

// Congested segments grouped by road, longest stretch first.
export function jammedRoads(corridors: Corridor[], limit: number): JammedRoad[] {
  const roads = new Map<string, JammedRoad>()
  for (const corridor of corridors) {
    if (corridor.band !== "congested" || !corridor.roadTc || corridor.speedKmh == null || corridor.speedKmh > MAX_JAM_KMH) continue
    const road = roads.get(corridor.roadTc) ?? { tc: corridor.roadTc, en: englishName(corridor.roadEn), km: 0, slowestKmh: Infinity }
    road.km += corridor.lengthKm
    road.slowestKmh = Math.min(road.slowestKmh, corridor.speedKmh)
    roads.set(corridor.roadTc, road)
  }
  return [...roads.values()]
    .filter((road) => road.km >= MIN_JAM_KM)
    .sort((a, b) => b.km - a.km)
    .slice(0, limit)
    .map((road) => ({ ...road, km: Math.round(road.km * 10) / 10, slowestKmh: Math.round(road.slowestKmh) }))
}

export function briefingFacts(input: BriefingInput): string {
  const lines = [`Time: ${hongKongTime(input.at)} Hong Kong time`]
  const summary = input.traffic?.ok ? input.traffic.summary : null
  lines.push(
    summary && summary.meanSpeedKmh != null
      ? `Road network: mean ${Math.round(summary.meanSpeedKmh)} km/h; segments free ${summary.free}, slow ${summary.slow}, congested ${summary.congested}`
      : "Road network: no reading",
  )
  lines.push(
    input.crossings.length > 0
      ? `Harbour crossings, fastest published time from any start: ${input.crossings.map((row) => `${TUNNEL[row.code] ?? row.code} ${row.minutes} min`).join(", ")}`
      : "Harbour crossings: no reading",
  )
  // Three is enough to read; five made the English run past the length check.
  const jams = input.traffic?.ok ? jammedRoads(input.traffic.corridors, 3) : []
  lines.push(
    jams.length > 0
      ? `Congested roads, longest first: ${jams.map((road) => `${road.tc} ${road.en} ${road.km} km, slowest ${road.slowestKmh} km/h`).join("; ")}`
      : "Congested roads: none",
  )
  // Absent topics are left out: a "none" line invites the model to say something was cleared.
  if (input.incidents.length > 0) {
    lines.push(`Open traffic incidents: ${input.incidents.map((row) => `${row.tc} ${row.en} at ${row.whereTc} ${row.whereEn}`.replace(/\s+/g, " ").trim()).join("; ")}`)
  }
  if (input.warnings.length > 0) lines.push(`Weather warnings now in effect: ${input.warnings.map((row) => row.name).join("; ")}`)
  const weather = input.conditions
  if (weather && weather.temperatureC != null) {
    lines.push(`Weather: ${weather.temperatureC}°C${weather.rainfallMm == null ? "" : `, rainfall in the past hour ${weather.rainfallMm} mm`}`)
  }
  return lines.join("\n")
}

function hongKongTime(at: Date): string {
  return new Date(at.getTime() + HK_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ")
}

// Road names in the feed are often upper case.
function englishName(name: string): string {
  if (name !== name.toUpperCase()) return name
  return name.toLowerCase().replace(/(^|[\s(\-–])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase())
}
