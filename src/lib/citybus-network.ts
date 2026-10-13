import networkFile from "../../data/citybus-network.json" with { type: "json" }
import { nearestPoints, pointsWithin, spreadWithin } from "./nearest.ts"
import { indexPoints, mates } from "./point-index.ts"
import { catalogueAccepts } from "./stop-list.ts"

type StopRecord = { tc: string; en: string; lng: number; lat: number; routes: string[] }
type NetworkFile = { stops: Record<string, StopRecord> }

export type CitybusStopPoint = { id: string; lng: number; lat: number; routes: string[] }

const network = networkFile as NetworkFile
const bundled = network.stops
const bundledStopCount = Object.keys(bundled).length
let records: Record<string, StopRecord> = bundled
let stopList: CitybusStopPoint[] = pointsOf(records)
let pointIndex = indexPoints(stopList)

export function citybusBundledStopCount(): number {
  return bundledStopCount
}

export function citybusBundledStop(id: string): StopRecord | null {
  return bundled[id] ?? null
}

export function replaceCitybusStops(next: Record<string, StopRecord>): boolean {
  if (!catalogueAccepts(Object.keys(next).length, bundledStopCount)) return false
  records = next
  publish()
  return true
}

export function patchCitybusStop(id: string, fix: { tc: string; en: string; lng: number; lat: number }): void {
  const current = records[id]
  if (!current) return
  if (current.tc === fix.tc && current.en === fix.en && current.lng === fix.lng && current.lat === fix.lat) return
  if (records === bundled) records = { ...bundled }
  records[id] = { ...current, tc: fix.tc, en: fix.en, lng: fix.lng, lat: fix.lat }
  publish()
}

function publish(): void {
  stopList = pointsOf(records)
  pointIndex = indexPoints(stopList)
}

function pointsOf(stops: Record<string, StopRecord>): CitybusStopPoint[] {
  return Object.entries(stops).map(([id, stop]) => ({ id, lng: stop.lng, lat: stop.lat, routes: stop.routes }))
}

export function citybusStop(id: string): StopRecord | null {
  return records[id] ?? null
}

export function citybusNamedStops(): { id: string; tc: string; en: string; lng: number; lat: number }[] {
  return Object.entries(records).map(([id, stop]) => ({ id, tc: stop.tc, en: stop.en, lng: stop.lng, lat: stop.lat }))
}

export function citybusPoleIds(id: string): string[] {
  const stop = records[id]
  if (!stop) return []
  return mates(pointIndex, id, stop.lng, stop.lat)
}

export function nearestCitybusStops(lng: number, lat: number, limit: number): CitybusStopPoint[] {
  return nearestPoints(stopList, lng, lat, limit)
}

export function citybusStopsWithin(lng: number, lat: number, radiusMetres: number, limit: number): CitybusStopPoint[] {
  return pointsWithin(stopList, lng, lat, radiusMetres, limit)
}

export function citybusStopsSpread(lng: number, lat: number, radiusMetres: number, limit: number): CitybusStopPoint[] {
  return spreadWithin(stopList, lng, lat, radiusMetres, limit)
}
