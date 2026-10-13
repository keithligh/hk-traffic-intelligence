import networkFile from "../../data/gmb-network.json" with { type: "json" }
import { pointsWithin, spreadWithin } from "@/lib/nearest"
import { idsAtPlace } from "@/lib/kmb-pole"

type StopRecord = {
  tc: string
  en: string
  lng: number
  lat: number
  routes: string[]
  ids: Record<string, string>
}

type NetworkFile = { stops: Record<string, StopRecord> }

export type GmbStopPoint = { id: string; lng: number; lat: number; routes: string[] }

const network = networkFile as NetworkFile
const stopList: GmbStopPoint[] = []
for (const [id, stop] of Object.entries(network.stops)) {
  if (!Number.isFinite(stop.lng) || !Number.isFinite(stop.lat)) continue
  stopList.push({ id, lng: stop.lng, lat: stop.lat, routes: stop.routes ?? [] })
}

export function gmbStop(id: string): StopRecord | null {
  return network.stops[id] ?? null
}

export function gmbNamedStops(): { id: string; tc: string; en: string; lng: number; lat: number }[] {
  return Object.entries(network.stops).flatMap(([id, stop]) => {
    if (!Number.isFinite(stop.lng) || !Number.isFinite(stop.lat)) return []
    return [{ id, tc: stop.tc, en: stop.en, lng: stop.lng, lat: stop.lat }]
  })
}

export function gmbPoleIds(id: string): string[] {
  return idsAtPlace(
    Object.entries(network.stops).map(([stopId, stop]) => ({ id: stopId, nameTc: stop.tc, lng: stop.lng, lat: stop.lat })),
    id,
  )
}

export function gmbStopsWithin(lng: number, lat: number, radiusMetres: number, limit: number): GmbStopPoint[] {
  return pointsWithin(stopList, lng, lat, radiusMetres, limit)
}

export function gmbStopsSpread(lng: number, lat: number, radiusMetres: number, limit: number): GmbStopPoint[] {
  return spreadWithin(stopList, lng, lat, radiusMetres, limit)
}
