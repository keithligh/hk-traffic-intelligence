import networkFile from "../../data/nlb-network.json" with { type: "json" }
import { nearestMetres, pointsWithin, spreadWithin } from "./nearest.ts"
import { idsAtPlace } from "./kmb-pole.ts"
import { catalogueAccepts } from "./stop-list.ts"
import { inLantau } from "./lantau.ts"

type Service = { id: string; code: string }
type StopRecord = { tc: string; en: string; lng: number; lat: number; routes: string[]; services: Service[] }
type NetworkFile = { stops: Record<string, StopRecord> }

export type NlbStopPoint = { id: string; lng: number; lat: number; routes: string[] }

const network = networkFile as NetworkFile
const bundledStopCount = Object.keys(network.stops).length
let records: Record<string, StopRecord> = network.stops
let stopList: NlbStopPoint[] = pointsOf(records)

export function nlbBundledStopCount(): number {
  return bundledStopCount
}

export function replaceNlbStops(next: Record<string, StopRecord>): boolean {
  if (!catalogueAccepts(Object.keys(next).length, bundledStopCount)) return false
  records = next
  stopList = pointsOf(next)
  return true
}

function pointsOf(stops: Record<string, StopRecord>): NlbStopPoint[] {
  return Object.entries(stops).map(([id, stop]) => ({ id, lng: stop.lng, lat: stop.lat, routes: stop.routes }))
}

export { inLantau }

export function nlbStop(id: string): StopRecord | null {
  return records[id] ?? null
}

export function nlbNamedStops(): { id: string; tc: string; en: string; lng: number; lat: number }[] {
  return Object.entries(records).map(([id, stop]) => ({ id, tc: stop.tc, en: stop.en, lng: stop.lng, lat: stop.lat }))
}

export function nlbPoleIds(id: string): string[] {
  return idsAtPlace(
    Object.entries(records).map(([stopId, stop]) => ({ id: stopId, nameTc: stop.tc, lng: stop.lng, lat: stop.lat })),
    id,
  )
}

export function nearestNlbStops(lng: number, lat: number, limit: number): NlbStopPoint[] {
  return nearestMetres(stopList, lng, lat, limit)
}

export function nlbStopsWithin(lng: number, lat: number, radiusMetres: number, limit: number): NlbStopPoint[] {
  return pointsWithin(stopList, lng, lat, radiusMetres, limit)
}

export function nlbStopsSpread(lng: number, lat: number, radiusMetres: number, limit: number): NlbStopPoint[] {
  return spreadWithin(stopList, lng, lat, radiusMetres, limit)
}
