import { loadClpStations, type ClpStation } from "./clp-chargers.ts"
import { loadChargerDistricts, withDistricts } from "./charger-districts.ts"
import { CHARGER_POLL_MS, loadEpdStations, type EpdStation } from "./epd-chargers.ts"
import { kmbReachMetres } from "./kmb-reach.ts"
import { metresPerPixel } from "./nearest.ts"
import catalogueFile from "../../data/ev-chargers.json" with { type: "json" }

export type ChargerPlace = {
  id: string
  nameTc: string
  nameEn: string
  districtTc: string
  lng: number
  lat: number
  standard: number
  medium: number
  quick: number
  fast: number
  free: number | null
}

export type ChargerPlacesResponse = { ok: true; places: ChargerPlace[] } | { ok: false; error?: string; places: ChargerPlace[] }

export const CHARGER_CAP = 40
export const CHARGER_WIDE_CAP = 1_600
export const PARKED_CHARGER_M = 15
const WIDE_RADIUS_M = 80_000

const catalogue = parseChargerPlaces(catalogueFile)

export function parseChargerPlaces(body: unknown): ChargerPlace[] {
  const rows = body && typeof body === "object" && "places" in body && Array.isArray(body.places) ? body.places : []
  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const id = text(row.id)
    const lng = number(row.lng)
    const lat = number(row.lat)
    if (!id || lng == null || lat == null) return []
    if (lng < 113.82 || lng > 114.45 || lat < 22.15 || lat > 22.58) return []
    return [
      {
        id,
        nameTc: text(row.nameTc),
        nameEn: text(row.nameEn),
        districtTc: text(row.districtTc),
        lng,
        lat,
        standard: count(row.standard),
        medium: count(row.medium),
        quick: count(row.quick),
        fast: count(row.fast),
        free: null,
      },
    ]
  })
}

export function keepChargerReading(
  fresh: readonly ChargerPlace[] | null,
  previous: readonly ChargerPlace[] | null,
  fallback: readonly ChargerPlace[],
): readonly ChargerPlace[] {
  if (fresh && fresh.length > 0) return fresh
  if (previous && previous.length > 0) return previous
  return fallback
}

let sharedChargers: { expires: number; places: ChargerPlace[] } | null = null

export async function loadChargerPlaces(lng: number, lat: number, zoom = Number.NaN, wide = false): Promise<{ ok: true; places: ChargerPlace[] }> {
  const places = await chargerList()
  return {
    ok: true,
    places: wide
      ? chargersNear(places, lng, lat, soloChargerRadiusMetres(zoom, lat), CHARGER_WIDE_CAP)
      : chargersNear(places, lng, lat, kmbReachMetres(zoom, lat)),
  }
}

async function chargerList(): Promise<ChargerPlace[]> {
  if (sharedChargers && sharedChargers.expires > Date.now()) return sharedChargers.places
  const [epd, clp, districts] = await Promise.all([loadEpdStations(), loadClpStations(), loadChargerDistricts()])
  const fresh = epd.ok && epd.stations.length > 0
    ? joinChargers(joinLive(catalogue, epd.stations.map(epdLive), "prefer"), clp)
    : null
  const places = withDistricts(
    keepChargerReading(fresh, sharedChargers?.places ?? null, joinChargers(catalogue, clp)),
    districts,
  )
  sharedChargers = { expires: Date.now() + CHARGER_POLL_MS, places }
  return places
}

const CHARGER_NAME_M = 80
const CHARGER_POINT_M = 15

type LiveCharger = {
  id: string
  source: "clp" | "epd"
  name: string
  nameTc: string
  lng: number
  lat: number
  free: number | null
  standard: number
  medium: number
  quick: number
  fast: number
  publishCounts: boolean
}

export function joinChargers(june: readonly ChargerPlace[], live: readonly ClpStation[]): ChargerPlace[] {
  return joinLive(june, live.map(clpLive), "fill")
}

export function joinLive(places: readonly ChargerPlace[], stations: readonly LiveCharger[], mode: "prefer" | "fill"): ChargerPlace[] {
  const pairs: { placeIndex: number; stationIndex: number; metres: number }[] = []
  for (let placeIndex = 0; placeIndex < places.length; placeIndex += 1) {
    const place = places[placeIndex]
    if (!place) continue
    for (let stationIndex = 0; stationIndex < stations.length; stationIndex += 1) {
      const station = stations[stationIndex]
      if (!station) continue
      const metres = chargerMetres(place, station)
      if (metres == null) continue
      pairs.push({ placeIndex, stationIndex, metres })
    }
  }
  pairs.sort((left, right) => left.metres - right.metres || left.placeIndex - right.placeIndex)
  const usedPlaces = new Set<number>()
  const usedStations = new Set<number>()
  const next = places.map((place) => ({ ...place }))
  for (const pair of pairs) {
    if (usedPlaces.has(pair.placeIndex) || usedStations.has(pair.stationIndex)) continue
    const place = next[pair.placeIndex]
    const station = stations[pair.stationIndex]
    if (!place || !station) continue
    usedPlaces.add(pair.placeIndex)
    usedStations.add(pair.stationIndex)
    applyStation(place, station, mode)
  }
  for (let index = 0; index < stations.length; index += 1) {
    if (usedStations.has(index)) continue
    const station = stations[index]
    if (!station) continue
    next.push(placeFromStation(station))
  }
  return next
}

function applyStation(place: ChargerPlace, station: LiveCharger, mode: "prefer" | "fill"): void {
  if (station.publishCounts) {
    place.standard = station.standard
    place.medium = station.medium
    place.quick = station.quick
    place.fast = station.fast
  }
  if (station.free == null) return
  switch (mode) {
    case "prefer":
      place.free = station.free
      return
    case "fill":
      if (place.free == null) place.free = station.free
      return
    default: {
      const unread: never = mode
      return unread
    }
  }
}

function placeFromStation(station: LiveCharger): ChargerPlace {
  return {
    id: `${station.source}:${station.id}`,
    nameTc: station.nameTc || station.name,
    nameEn: station.name || station.nameTc,
    districtTc: "",
    lng: station.lng,
    lat: station.lat,
    standard: station.standard,
    medium: station.medium,
    quick: station.quick,
    fast: station.fast,
    free: station.free,
  }
}

function clpLive(station: ClpStation): LiveCharger {
  return {
    id: station.id,
    source: "clp",
    name: station.name,
    nameTc: "",
    lng: station.lng,
    lat: station.lat,
    free: station.free,
    standard: 0,
    medium: station.semiQuick,
    quick: station.quick,
    fast: 0,
    publishCounts: false,
  }
}

function epdLive(station: EpdStation): LiveCharger {
  return { ...station, source: "epd" }
}

function chargerMetres(place: ChargerPlace, station: LiveCharger): number | null {
  const metres = metresBetween(place.lng, place.lat, station.lng, station.lat)
  if (metres <= CHARGER_POINT_M) return metres
  if (metres > CHARGER_NAME_M) return null
  const named = namesMatch(place.nameEn, station.name)
    || namesMatch(place.nameTc, station.name)
    || namesMatch(place.nameTc, station.nameTc)
    || namesMatch(place.nameEn, station.nameTc)
  return named ? metres : null
}

function namesMatch(left: string, right: string): boolean {
  const a = left.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "")
  const b = right.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "")
  if (a.length < 4 || b.length < 4) return false
  return a === b || a.includes(b) || b.includes(a)
}

export function soloChargerRadiusMetres(zoom: number, lat: number): number {
  if (!Number.isFinite(zoom)) return WIDE_RADIUS_M
  return Math.min(WIDE_RADIUS_M, Math.max(800, metresPerPixel(zoom, lat) * 1_600))
}

export function chargersNear(
  places: readonly ChargerPlace[],
  lng: number,
  lat: number,
  radiusM: number,
  cap = CHARGER_CAP,
): ChargerPlace[] {
  const near = places.flatMap((place) => {
    const metres = metresBetween(lng, lat, place.lng, place.lat)
    if (metres > radiusM) return []
    return [{ place, metres }]
  })
  near.sort((left, right) => left.metres - right.metres)
  return near.slice(0, cap).map((item) => item.place)
}

export function chargersInsideParks<T extends { id: string; lng: number; lat: number }>(
  places: readonly ChargerPlace[],
  parks: readonly T[],
): Map<string, ChargerPlace[]> {
  const nearestByCharger = new Map<string, { parkId: string; metres: number; place: ChargerPlace }>()
  for (const place of places) {
    let nearest: { parkId: string; metres: number } | null = null
    for (const park of parks) {
      const metres = metresBetween(place.lng, place.lat, park.lng, park.lat)
      if (metres > PARKED_CHARGER_M) continue
      if (!nearest || metres < nearest.metres) nearest = { parkId: park.id, metres }
    }
    if (!nearest) continue
    const current = nearestByCharger.get(place.id)
    if (!current || nearest.metres < current.metres) nearestByCharger.set(place.id, { ...nearest, place })
  }
  const grouped = new Map<string, { place: ChargerPlace; metres: number }[]>()
  for (const hit of nearestByCharger.values()) {
    const list = grouped.get(hit.parkId) ?? []
    list.push({ place: hit.place, metres: hit.metres })
    grouped.set(hit.parkId, list)
  }
  return new Map([...grouped].map(([id, list]) => {
    list.sort((left, right) => left.metres - right.metres)
    return [id, list.map((item) => item.place)]
  }))
}

function metresBetween(lng: number, lat: number, placeLng: number, placeLat: number): number {
  const radius = 6_371_000
  const fromLat = (lat * Math.PI) / 180
  const toLat = (placeLat * Math.PI) / 180
  const dLat = ((placeLat - lat) * Math.PI) / 180
  const dLng = ((placeLng - lng) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(a))
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function number(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0
  return Math.round(value)
}
