import { parseCsv } from "./csv.ts"
import { pointsWithin, spreadWithin } from "./nearest.ts"

export type MeterKind = "general" | "goods" | "coach"

export type MeterSpace = {
  id: string
  kind: MeterKind
  vacant: boolean | null
  updated: string
}

export type MeterSite = {
  id: string
  lng: number
  lat: number
  streetTc: string
  streetEn: string
  sectionTc: string
  sectionEn: string
  spaces: { id: string; kind: MeterKind }[]
}

export type MeterPole = {
  id: string
  lng: number
  lat: number
  streetTc: string
  streetEn: string
  sectionTc: string
  sectionEn: string
  spaces: MeterSpace[]
}

export type MeterPlacesResponse = { ok: true; poles: MeterPole[] } | { ok: false; error?: string; poles: MeterPole[] }

export const METER_CAP = 40
export const METER_WIDE_CAP = 600
export const METER_POLL_MS = 60_000

export function parseMeterSites(spaceCsv: string): MeterSite[] {
  const poles = new Map<string, MeterSite>()
  for (const row of table(spaceCsv, "PoleId")) {
    const poleId = row.PoleId
    const spaceId = row.ParkingSpaceId
    const kind = kindOf(row.VehicleType ?? "")
    const lng = Number(row.Longitude)
    const lat = Number(row.Latitude)
    if (!poleId || !spaceId || !kind || !Number.isFinite(lng) || !Number.isFinite(lat)) continue
    const space = { id: spaceId, kind }
    const pole = poles.get(poleId)
    if (!pole) {
      poles.set(poleId, {
        id: poleId,
        lng,
        lat,
        streetTc: row.Street_tc ?? "",
        streetEn: row.Street ?? "",
        sectionTc: row.SectionOfStreet_tc ?? "",
        sectionEn: row.SectionOfStreet ?? "",
        spaces: [space],
      })
      continue
    }
    pole.spaces.push(space)
  }
  for (const pole of poles.values()) {
    pole.spaces.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  }
  return [...poles.values()]
}

export function joinMeterOccupancy(sites: readonly MeterSite[], occupancyCsv: string): MeterPole[] {
  const occupancy = new Map<string, { status: string; occupied: string; updated: string }>()
  for (const row of table(occupancyCsv, "ParkingSpaceId")) {
    const id = row.ParkingSpaceId
    if (!id) continue
    occupancy.set(id, {
      status: row.ParkingMeterStatus ?? "",
      occupied: row.OccupancyStatus ?? "",
      updated: row.OccupancyDateChanged ?? "",
    })
  }
  return sites.map((site) => ({
    id: site.id,
    lng: site.lng,
    lat: site.lat,
    streetTc: site.streetTc,
    streetEn: site.streetEn,
    sectionTc: site.sectionTc,
    sectionEn: site.sectionEn,
    spaces: site.spaces.map((space) => {
      const reading = occupancy.get(space.id)
      return {
        id: space.id,
        kind: space.kind,
        vacant: vacantOf(reading?.status ?? "", reading?.occupied ?? ""),
        updated: reading?.updated ?? "",
      }
    }),
  }))
}

export function parseMeterPoles(spaceCsv: string, occupancyCsv: string): MeterPole[] {
  return joinMeterOccupancy(parseMeterSites(spaceCsv), occupancyCsv)
}

export function meterClock(updated: string): string {
  const match = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i.exec(updated)
  if (!match?.[1] || !match[2]) return ""
  let hour = Number(match[1])
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return ""
  const meridiem = match[3]?.toUpperCase()
  if (meridiem && hour > 12) return ""
  if (meridiem === "PM" && hour < 12) hour += 12
  if (meridiem === "AM" && hour === 12) hour = 0
  return `${String(hour).padStart(2, "0")}:${match[2]}`
}

export function meterPolesNear(poles: readonly MeterPole[], lng: number, lat: number, radiusMetres: number, limit = METER_CAP): MeterPole[] {
  return pointsWithin(poles, lng, lat, radiusMetres, limit)
}

export function meterPolesWide(poles: readonly MeterPole[], lng: number, lat: number, radiusMetres: number, limit = METER_WIDE_CAP): MeterPole[] {
  return spreadWithin(poles, lng, lat, radiusMetres, limit)
}

export function meterFree(pole: MeterPole): number {
  return pole.spaces.filter((space) => space.vacant === true).length
}

export type MeterTone = "open" | "full" | "closed"
export type MeterFleet = "private" | "other"

export function meterTone(pole: MeterPole): MeterTone {
  let occupied = false
  for (const space of pole.spaces) {
    if (space.vacant === true) return "open"
    if (space.vacant === false) occupied = true
  }
  return occupied ? "full" : "closed"
}

export function meterFleet(pole: MeterPole): MeterFleet {
  let privateFree = false
  let otherFree = false
  let privateSpace = false
  for (const space of pole.spaces) {
    const fleet = fleetOf(space.kind)
    if (fleet === "private") privateSpace = true
    if (space.vacant !== true) continue
    if (fleet === "private") privateFree = true
    else otherFree = true
  }
  if (privateFree) return "private"
  if (otherFree) return "other"
  return privateSpace ? "private" : "other"
}

const METER_FLEETS = ["private", "other"] as const
const METER_TONES = ["open", "full", "closed"] as const
type Same<Left, Right> = (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false
const fleetsCovered: Same<(typeof METER_FLEETS)[number], MeterFleet> = true
const tonesCovered: Same<(typeof METER_TONES)[number], MeterTone> = true
export const meterUnionsCovered = fleetsCovered && tonesCovered

function meterKey(fleet: MeterFleet, tone: MeterTone): string {
  return `${fleet}-${tone}`
}

export function meterMark(pole: MeterPole): string {
  return meterKey(meterFleet(pole), meterTone(pole))
}

export function meterPin(pole: MeterPole): { mark: string; stroke: string } {
  const tone = meterTone(pole)
  const fleet = meterFleet(pole)
  return { mark: meterKey(fleet, tone), stroke: meterInk(fleet, tone).stroke }
}

const METER_INK: Record<MeterFleet, Record<MeterTone, { fill: string; stroke: string }>> = {
  private: {
    open: { fill: "#dbeafe", stroke: "#1d4ed8" },
    full: { fill: "#e2e8f0", stroke: "#475569" },
    closed: { fill: "#f8fafc", stroke: "#94a3b8" },
  },
  other: {
    open: { fill: "#fae8ff", stroke: "#a21caf" },
    full: { fill: "#fdf4ff", stroke: "#86198f" },
    closed: { fill: "#faf5ff", stroke: "#c084fc" },
  },
}

export function meterInk(fleet: MeterFleet, tone: MeterTone): { fill: string; stroke: string } {
  return METER_INK[fleet][tone]
}

export function meterColorStops(part: "fill" | "stroke"): [string, string][] {
  const stops: [string, string][] = []
  for (const fleet of METER_FLEETS) {
    for (const tone of METER_TONES) stops.push([meterKey(fleet, tone), meterInk(fleet, tone)[part]])
  }
  return stops
}

export function meterReported(pole: MeterPole): boolean {
  return pole.spaces.some((space) => space.vacant !== null || space.updated !== "")
}

export function meterPlateCount(pole: MeterPole): string | null {
  if (!meterReported(pole) || meterTone(pole) === "closed") return null
  return String(meterFree(pole))
}

function fleetOf(kind: MeterKind): MeterFleet {
  switch (kind) {
    case "general":
      return "private"
    case "goods":
    case "coach":
      return "other"
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

function kindOf(type: string): MeterKind | null {
  switch (type.toUpperCase()) {
    case "A":
      return "general"
    case "G":
      return "goods"
    case "C":
      return "coach"
    default:
      return null
  }
}

function vacantOf(status: string, occupied: string): boolean | null {
  if (status.toUpperCase() === "NU") return null
  if (occupied === "V") return true
  if (occupied === "O") return false
  return null
}

function table(text: string, headerName: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
  const start = lines.findIndex((line) => line.startsWith(`${headerName},`) || line.startsWith(`${headerName}\r`))
  if (start < 0) return []
  return parseCsv(lines.slice(start).join("\n"))
}
