import networkFile from "../../data/mtr-network.json" with { type: "json" }
import { projectTrain, type EstimateRoute, type GeoPoint, type TrainSpot } from "@/lib/mtr-estimate"
import { segmentSpan } from "@/lib/rail-tracks"
import type { MtrTrain } from "@/lib/types"

type StationRecord = { en: string; tc: string; lng: number; lat: number }
type LineRecord = { en: string; tc: string; color: string }
type NetworkFile = {
  stations: Record<string, StationRecord>
  lines: Record<string, LineRecord>
  routes: { id: string; line: string; stations: string[] }[]
}

const network = networkFile as NetworkFile
const bundledStationCount = Object.keys(network.stations).length
let stationRecords: Record<string, StationRecord> = network.stations

export function mtrBundledStationCount(): number {
  return bundledStationCount
}

export function mtrStationRecords(): Record<string, StationRecord> {
  return stationRecords
}

export function replaceMtrStations(next: Record<string, StationRecord>): boolean {
  if (Object.keys(next).length < Math.floor(bundledStationCount * 0.9)) return false
  stationRecords = next
  return true
}

export type MtrStationPin = { code: string; en: string; tc: string; lng: number; lat: number }

export function replaceMtrStationList(list: readonly MtrStationPin[]): boolean {
  const next: Record<string, StationRecord> = {}
  for (const station of list) {
    if (!station.code) continue
    next[station.code] = { en: station.en, tc: station.tc, lng: station.lng, lat: station.lat }
  }
  return replaceMtrStations(next)
}

const linesThroughStation = new Map<string, string[]>()
for (const route of network.routes) {
  for (const code of route.stations) {
    const lines = linesThroughStation.get(code) ?? []
    if (!lines.includes(route.line)) lines.push(route.line)
    linesThroughStation.set(code, lines)
  }
}
if (stationRecords.RAC && !linesThroughStation.has("RAC")) linesThroughStation.set("RAC", ["EAL"])

export function networkRoutes(): EstimateRoute[] {
  return network.routes
}

export function mtrQueries(): { line: string; station: string }[] {
  const pairs = new Map<string, { line: string; station: string }>()
  for (const route of network.routes) {
    for (const station of route.stations) {
      pairs.set(`${route.line}-${station}`, { line: route.line, station })
    }
  }
  if (stationRecords.RAC) pairs.set("EAL-RAC", { line: "EAL", station: "RAC" })
  return [...pairs.values()]
}

export function stationRecord(code: string): StationRecord | null {
  return stationRecords[code] ?? null
}

export function stationNamedIn(text: string): { lng: number; lat: number } | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  let best: { lng: number; lat: number; score: number } | null = null
  for (const station of Object.values(stationRecords)) {
    const tcHit = station.tc.length >= 2 && trimmed.includes(station.tc)
    const enHit = new RegExp(`\\b${station.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(trimmed)
    if (!tcHit && !enHit) continue
    const score = Math.max(tcHit ? station.tc.length : 0, enHit ? station.en.length : 0)
    if (!best || score > best.score) best = { lng: station.lng, lat: station.lat, score }
  }
  return best ? { lng: best.lng, lat: best.lat } : null
}

export function mtrNamedStations(): { id: string; tc: string; en: string; lng: number; lat: number }[] {
  return Object.entries(stationRecords).map(([id, station]) => ({ id, tc: station.tc, en: station.en, lng: station.lng, lat: station.lat }))
}

export function lineRecord(code: string): LineRecord | null {
  return network.lines[code] ?? null
}

export function linesThrough(station: string): string[] {
  return linesThroughStation.get(station) ?? []
}

export function stationPoint(code: string): GeoPoint | null {
  const station = stationRecords[code]
  if (!station) return null
  return { lng: station.lng, lat: station.lat }
}

export function projectNetworkTrain(train: MtrTrain, atMs: number): TrainSpot | null {
  const observedAt = Date.parse(train.observedAt)
  if (!Number.isFinite(observedAt)) return null
  return projectTrain({ ...train, observedAt }, stationPoint, atMs)
}

export function mtrTrackCollection(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const [line, meta] of Object.entries(network.lines)) {
    const edges = new Map<string, [number, number][]>()
    const addEdge = (fromCode: string, toCode: string) => {
      const from = stationPoint(fromCode)
      const to = stationPoint(toCode)
      if (!from || !to) return
      const key = [fromCode, toCode].sort().join(">")
      if (!edges.has(key)) edges.set(key, segmentSpan(fromCode, toCode, from, to).map((point) => [point.lng, point.lat]))
    }
    for (const route of network.routes) {
      if (route.line !== line) continue
      for (let index = 1; index < route.stations.length; index += 1) {
        const fromCode = route.stations[index - 1]
        const toCode = route.stations[index]
        if (fromCode && toCode) addEdge(fromCode, toCode)
      }
    }
    if (line === "EAL") {
      addEdge("SHT", "RAC")
      addEdge("RAC", "UNI")
    }
    if (edges.size === 0) continue
    features.push({
      type: "Feature",
      properties: { line, color: meta.color },
      geometry: { type: "MultiLineString", coordinates: [...edges.values()] },
    })
  }
  return { type: "FeatureCollection", features }
}

export function mtrStationCollection(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: Object.entries(stationRecords).map(([code, station]) => ({
      type: "Feature",
      properties: { code, name: station.en, nameTc: station.tc },
      geometry: { type: "Point", coordinates: [station.lng, station.lat] },
    })),
  }
}
