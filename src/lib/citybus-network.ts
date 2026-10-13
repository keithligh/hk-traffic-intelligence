import networkFile from "../../data/citybus-network.json" with { type: "json" }
import { nearestPoints, pointsWithin, spreadWithin } from "@/lib/nearest"
import { indexPoints, mates } from "@/lib/point-index"

type StopRecord = { tc: string; en: string; lng: number; lat: number; routes: string[] }
type NetworkFile = { stops: Record<string, StopRecord> }

export type CitybusStopPoint = { id: string; lng: number; lat: number; routes: string[] }

const network = networkFile as NetworkFile

const stopList: CitybusStopPoint[] = []
for (const [id, stop] of Object.entries(network.stops)) {
  stopList.push({ id, lng: stop.lng, lat: stop.lat, routes: stop.routes })
}

const pointIndex = indexPoints(stopList)

export function citybusStop(id: string): StopRecord | null {
  return network.stops[id] ?? null
}

export function citybusNamedStops(): { id: string; tc: string; en: string; lng: number; lat: number }[] {
  return Object.entries(network.stops).map(([id, stop]) => ({ id, tc: stop.tc, en: stop.en, lng: stop.lng, lat: stop.lat }))
}

export function citybusPoleIds(id: string): string[] {
  const stop = network.stops[id]
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
