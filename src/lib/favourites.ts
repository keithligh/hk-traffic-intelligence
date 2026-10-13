import { controlName } from "./i18n.ts"

export const PLACES_LIMIT = 100

export const FAVOURITE_LAYERS = [
  "control",
  "mtr",
  "lrt",
  "kmb",
  "citybus",
  "gmb",
  "nlb",
  "mtrbus",
  "ferry",
  "parking",
  "motorcycle",
  "kerb",
  "meter",
  "charger",
  "cameras",
  "speedcam",
] as const

export type FavouriteLayer = (typeof FAVOURITE_LAYERS)[number]

export type Favourite = {
  layer: FavouriteLayer
  id: string
  nameTc: string
  nameEn: string
  coordinates: [number, number]
}

const HITS: Record<string, FavouriteLayer> = {
  "control-points": "control",
  "mtr-stations": "mtr",
  "mtr-station-label": "mtr",
  "lrt-stations": "lrt",
  "lrt-station-label": "lrt",
  "kmb-stops": "kmb",
  "kmb-stop-label": "kmb",
  "citybus-stops": "citybus",
  "citybus-stop-label": "citybus",
  "gmb-stops": "gmb",
  "gmb-stop-label": "gmb",
  "nlb-stops": "nlb",
  "nlb-stop-label": "nlb",
  "mtrbus-stops": "mtrbus",
  "mtrbus-stop-label": "mtrbus",
  "ferry-piers": "ferry",
  "ferry-pier-label": "ferry",
  parking: "parking",
  "parking-label": "parking",
  motorcycle: "motorcycle",
  "motorcycle-label": "motorcycle",
  kerb: "kerb",
  "kerb-label": "kerb",
  meters: "meter",
  "meters-label": "meter",
  chargers: "charger",
  "chargers-label": "charger",
  "cameras-harbour": "cameras",
  "cameras-portal": "cameras",
  "cameras-city": "cameras",
  "speed-cams": "speedcam",
}

export function readPlaces(raw: string | null): Favourite[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  const rows = rowsOf(parsed)
  const places: Favourite[] = []
  for (const row of rows) {
    const place = placeOf(row)
    if (!place || places.some((kept) => samePlace(kept, place))) continue
    places.push(place)
    if (places.length === PLACES_LIMIT) break
  }
  return places
}

export function togglePlace(places: readonly Favourite[], place: Favourite): Favourite[] {
  if (places.some((kept) => samePlace(kept, place))) return places.filter((kept) => !samePlace(kept, place))
  if (places.length >= PLACES_LIMIT) return [...places]
  return [place, ...places]
}

export function mergePlaces(current: readonly Favourite[], incoming: readonly Favourite[]): Favourite[] {
  return readPlaces(JSON.stringify({ places: [...incoming, ...current] }))
}

export function placesFile(places: readonly Favourite[]): string {
  return JSON.stringify({ version: 1, places: readPlaces(JSON.stringify({ places })) })
}

export function placesFromFile(raw: string): Favourite[] {
  return readPlaces(raw)
}

export function readPlacesFile(raw: string): { ok: true; places: Favourite[] } | { ok: false } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false }
  }
  if (Array.isArray(parsed)) return { ok: true, places: readPlaces(raw) }
  if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { places?: unknown }).places)) {
    return { ok: true, places: readPlaces(raw) }
  }
  return { ok: false }
}

export function favouriteFromHit(
  layerId: string,
  properties: GeoJSON.GeoJsonProperties,
  geometry: GeoJSON.Geometry | null | undefined,
): Favourite | null {
  const layer = HITS[layerId]
  if (!layer || geometry?.type !== "Point") return null
  const pair = geometry.coordinates
  const lng = pair[0]
  const lat = pair[1]
  if (typeof lng !== "number" || typeof lat !== "number") return null
  const id = layer === "control" || layer === "mtr" || layer === "lrt" ? text(properties, "code") : text(properties, "id")
  if (!id) return null
  const names = namesOf(layer, id, properties)
  if (!names.nameTc && !names.nameEn) return null
  const place = placeOf({ layer, id, ...names, coordinates: [lng, lat] })
  return place
}

function namesOf(layer: FavouriteLayer, id: string, properties: GeoJSON.GeoJsonProperties): { nameTc: string; nameEn: string } {
  if (layer === "control") {
    const english = text(properties, "name")
    return { nameTc: controlName("zh-HK", id, english), nameEn: english || controlName("en", id, english) }
  }
  if (layer === "meter" || layer === "kerb") {
    return { nameTc: text(properties, "streetTc"), nameEn: text(properties, "streetEn") }
  }
  if (layer === "mtr" || layer === "lrt" || layer === "cameras" || layer === "speedcam") {
    return { nameTc: text(properties, "nameTc"), nameEn: text(properties, "name") }
  }
  return { nameTc: text(properties, "nameTc"), nameEn: text(properties, "nameEn") }
}

function rowsOf(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed
  if (typeof parsed !== "object" || parsed === null) return []
  const places = (parsed as { places?: unknown }).places
  return Array.isArray(places) ? places : []
}

function placeOf(value: unknown): Favourite | null {
  if (typeof value !== "object" || value === null) return null
  const row = value as Record<string, unknown>
  if (!isLayer(row.layer) || typeof row.id !== "string" || row.id.length === 0) return null
  if (typeof row.nameTc !== "string" || typeof row.nameEn !== "string") return null
  if (!row.nameTc && !row.nameEn) return null
  if (!Array.isArray(row.coordinates) || row.coordinates.length < 2) return null
  const lng = row.coordinates[0]
  const lat = row.coordinates[1]
  if (typeof lng !== "number" || typeof lat !== "number") return null
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) return null
  return { layer: row.layer, id: row.id, nameTc: row.nameTc, nameEn: row.nameEn, coordinates: [lng, lat] }
}

function samePlace(left: Favourite, right: Favourite): boolean {
  return left.layer === right.layer && left.id === right.id
}

function isLayer(value: unknown): value is FavouriteLayer {
  return typeof value === "string" && FAVOURITE_LAYERS.some((layer) => layer === value)
}

function text(properties: GeoJSON.GeoJsonProperties, key: string): string {
  const value = properties?.[key]
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : ""
}

export const PLACES_KEY = "hk-traffic-places"

export type PlaceStore = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function loadPlaces(store: PlaceStore): Favourite[] {
  try {
    return readPlaces(store.getItem(PLACES_KEY))
  } catch {
    return []
  }
}

export function savePlaces(store: PlaceStore, places: readonly Favourite[]): boolean {
  try {
    store.setItem(PLACES_KEY, JSON.stringify(readPlaces(JSON.stringify({ places }))))
    return true
  } catch {
    return false
  }
}

const placeListeners = new Set<() => void>()
let placeCurrent: Favourite[] = []
const placesServerSnapshotList: Favourite[] = []
let placesLoaded = false

export function placesServerSnapshot(): Favourite[] {
  return placesServerSnapshotList
}

export function placesSnapshot(): Favourite[] {
  ensurePlaces()
  return placeCurrent
}

export function subscribePlaces(listener: () => void): () => void {
  placeListeners.add(listener)
  return () => {
    placeListeners.delete(listener)
  }
}

export function replacePlaces(places: readonly Favourite[]): void {
  ensurePlaces()
  placeCurrent = readPlaces(JSON.stringify({ places }))
  if (typeof window !== "undefined") {
    try {
      savePlaces(window.localStorage, placeCurrent)
    } catch {
      // A private browser can refuse the write. The choice still applies for this visit.
    }
  }
  for (const listener of placeListeners) listener()
}

let storageBound = false

export function applyExternalPlaces(raw: string | null): void {
  placesLoaded = true
  placeCurrent = readPlaces(raw)
  for (const listener of placeListeners) listener()
}

function bindStorage(): void {
  if (storageBound || typeof window === "undefined" || typeof window.addEventListener !== "function") return
  storageBound = true
  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key !== PLACES_KEY) return
    applyExternalPlaces(event.newValue)
  })
}

function ensurePlaces(): void {
  if (typeof window === "undefined") return
  bindStorage()
  if (placesLoaded) return
  placesLoaded = true
  try {
    placeCurrent = loadPlaces(window.localStorage)
  } catch {
    placeCurrent = []
  }
}
