import networkFile from "../../data/nlb-network.json" with { type: "json" }
import { nearestMetres, spreadWithin } from "@/lib/nearest"
import { idsAtPlace } from "@/lib/kmb-pole"
import { inLantau } from "./lantau.ts"

type Service = { id: string; code: string }
type StopRecord = { tc: string; en: string; lng: number; lat: number; routes: string[]; services: Service[] }
type NetworkFile = { stops: Record<string, StopRecord> }

export type NlbStopPoint = { id: string; lng: number; lat: number; routes: string[] }

const network = networkFile as NetworkFile
const stopList: NlbStopPoint[] = []
for (const [id, stop] of Object.entries(network.stops)) {
  stopList.push({ id, lng: stop.lng, lat: stop.lat, routes: stop.routes })
}

export { inLantau }

export function nlbStop(id: string): StopRecord | null {
  return network.stops[id] ?? null
}

export function nlbNamedStops(): { id: string; tc: string; en: string; lng: number; lat: number }[] {
  return Object.entries(network.stops).map(([id, stop]) => ({ id, tc: stop.tc, en: stop.en, lng: stop.lng, lat: stop.lat }))
}

export function nlbPoleIds(id: string): string[] {
  return idsAtPlace(
    Object.entries(network.stops).map(([stopId, stop]) => ({ id: stopId, nameTc: stop.tc, lng: stop.lng, lat: stop.lat })),
    id,
  )
}

export function nearestNlbStops(lng: number, lat: number, limit: number): NlbStopPoint[] {
  return nearestMetres(stopList, lng, lat, limit)
}

export function nlbStopsSpread(lng: number, lat: number, radiusMetres: number, limit: number): NlbStopPoint[] {
  return spreadWithin(stopList, lng, lat, radiusMetres, limit)
}
