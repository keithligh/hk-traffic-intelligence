import networkFile from "../../data/gmb-network.json" with { type: "json" }
import { pointsWithin, spreadWithin } from "@/lib/nearest"
import { idsAtPlace } from "@/lib/kmb-pole"
import { catalogueAccepts } from "@/lib/stop-list"

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
const bundled = network.stops
const bundledStopCount = Object.keys(bundled).length
let records: Record<string, StopRecord> = bundled
let stopList: GmbStopPoint[] = pointsOf(records)

export function gmbBundledStopCount(): number {
  return bundledStopCount
}

export function gmbBundledStop(id: string): StopRecord | null {
  return bundled[id] ?? null
}

export function replaceGmbStops(next: Record<string, StopRecord>): boolean {
  if (!catalogueAccepts(Object.keys(next).length, bundledStopCount)) return false
  records = next
  publish()
  return true
}

export function patchGmbStop(id: string, fix: { tc: string; en: string; lng: number; lat: number }): void {
  const current = records[id]
  if (!current) return
  if (current.tc === fix.tc && current.en === fix.en && current.lng === fix.lng && current.lat === fix.lat) return
  if (records === bundled) records = { ...bundled }
  records[id] = { ...current, tc: fix.tc, en: fix.en, lng: fix.lng, lat: fix.lat }
  publish()
}

export function dropGmbStop(id: string): void {
  if (!records[id]) return
  if (records === bundled) records = { ...bundled }
  delete records[id]
  publish()
}

function publish(): void {
  stopList = pointsOf(records)
}

function pointsOf(stops: Record<string, StopRecord>): GmbStopPoint[] {
  const points: GmbStopPoint[] = []
  for (const [id, stop] of Object.entries(stops)) {
    if (!Number.isFinite(stop.lng) || !Number.isFinite(stop.lat)) continue
    points.push({ id, lng: stop.lng, lat: stop.lat, routes: stop.routes ?? [] })
  }
  return points
}

export function gmbStop(id: string): StopRecord | null {
  return records[id] ?? null
}

export function gmbNamedStops(): { id: string; tc: string; en: string; lng: number; lat: number }[] {
  return Object.entries(records).flatMap(([id, stop]) => {
    if (!Number.isFinite(stop.lng) || !Number.isFinite(stop.lat)) return []
    return [{ id, tc: stop.tc, en: stop.en, lng: stop.lng, lat: stop.lat }]
  })
}

export function gmbPoleIds(id: string): string[] {
  return idsAtPlace(
    Object.entries(records).map(([stopId, stop]) => ({ id: stopId, nameTc: stop.tc, lng: stop.lng, lat: stop.lat })),
    id,
  )
}

export function gmbStopsWithin(lng: number, lat: number, radiusMetres: number, limit: number): GmbStopPoint[] {
  return pointsWithin(stopList, lng, lat, radiusMetres, limit)
}

export function gmbStopsSpread(lng: number, lat: number, radiusMetres: number, limit: number): GmbStopPoint[] {
  return spreadWithin(stopList, lng, lat, radiusMetres, limit)
}
