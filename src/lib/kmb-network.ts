import networkFile from "../../data/kmb-network.json" with { type: "json" }
import { pointsWithin, spreadWithin } from "@/lib/nearest"
import { idsAtPlace } from "@/lib/kmb-pole"
import { catalogueAccepts } from "@/lib/stop-list"

type StopRecord = { tc: string; en: string; lng: number; lat: number }
type NetworkFile = { stops: Record<string, StopRecord> }

export type KmbStopPoint = { id: string; lng: number; lat: number }

const network = networkFile as NetworkFile

const stopList: KmbStopPoint[] = []
for (const [id, stop] of Object.entries(network.stops)) {
  stopList.push({ id, lng: stop.lng, lat: stop.lat })
}
const bundledCount = stopList.length
let records: Record<string, StopRecord> = network.stops

export function kmbBundledStopCount(): number {
  return bundledCount
}

export function replaceKmbCatalogue(stops: Record<string, StopRecord>): boolean {
  const entries = Object.entries(stops)
  if (!catalogueAccepts(entries.length, bundledCount)) return false
  const nextRecords: Record<string, StopRecord> = {}
  const nextPoints: KmbStopPoint[] = []
  for (const [id, stop] of entries) {
    nextRecords[id] = { tc: stop.tc, en: stop.en, lng: stop.lng, lat: stop.lat }
    nextPoints.push({ id, lng: stop.lng, lat: stop.lat })
  }
  records = nextRecords
  stopList.length = 0
  stopList.push(...nextPoints)
  return true
}

export function kmbStop(id: string): StopRecord | null {
  return records[id] ?? null
}

export function kmbNamedStops(): { id: string; tc: string; en: string; lng: number; lat: number }[] {
  return Object.entries(records).map(([id, stop]) => ({ id, tc: stop.tc, en: stop.en, lng: stop.lng, lat: stop.lat }))
}

export function kmbPoleIds(id: string): string[] {
  return idsAtPlace(
    Object.entries(records).map(([stopId, stop]) => ({ id: stopId, nameTc: stop.tc, lng: stop.lng, lat: stop.lat })),
    id,
  )
}

export function kmbStopsWithin(lng: number, lat: number, radiusMetres: number, limit: number): KmbStopPoint[] {
  return pointsWithin(stopList, lng, lat, radiusMetres, limit)
}

export function kmbStopsSpread(lng: number, lat: number, radiusMetres: number, limit: number): KmbStopPoint[] {
  return spreadWithin(stopList, lng, lat, radiusMetres, limit)
}
