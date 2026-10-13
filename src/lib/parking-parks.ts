import { metresPerPixel } from "./nearest.ts"

export type ParkingPark = {
  id: string
  nameTc: string
  nameEn: string
  addressTc: string
  addressEn: string
  lng: number
  lat: number
  heightM: number | null
}

export type ParkingKind = "private" | "lgv" | "hgv" | "motorcycle"

export type ParkingState = "number" | "unpublished" | "closed"

export type ParkingSpace = {
  kind: ParkingKind
  state: ParkingState
  vacancy: number | null
  ev: number | null
  updated: string
}

const PARK_CAP = 40
const WIDE_RADIUS_M = 80_000

export function soloParkingRadiusMetres(zoom: number, lat: number): number {
  if (!Number.isFinite(zoom)) return WIDE_RADIUS_M
  return Math.min(WIDE_RADIUS_M, Math.max(800, metresPerPixel(zoom, lat) * 1_600))
}

export function parkLists<T extends ParkingPark>(
  parks: readonly T[],
  cars: ReadonlyMap<string, number>,
  motorcycles: ReadonlyMap<string, number>,
): { parks: (T & { cars: number | null })[]; motorcycles: (T & { motorcycle: number })[] } {
  return {
    parks: parks.map((park) => ({ ...park, cars: cars.get(park.id) ?? null })),
    motorcycles: parks.flatMap((park) => {
      const motorcycle = motorcycles.get(park.id)
      return motorcycle == null ? [] : [{ ...park, motorcycle }]
    }),
  }
}

export function carPinsWhenBoth<T extends { id: string; cars: number | null }>(
  parks: readonly T[],
  motorcycleOn: boolean,
  motorcycleIds: ReadonlySet<string>,
): T[] {
  if (!motorcycleOn) return [...parks]
  return parks.filter((park) => park.cars != null || !motorcycleIds.has(park.id))
}

export function motorcyclePinsWhenBoth<T extends { id: string }>(motorcycles: readonly T[]): T[] {
  return [...motorcycles]
}

export function motorcyclePlateDrop(id: string, carIds: ReadonlySet<string>): 0 | 1 {
  return carIds.has(id) ? 1 : 0
}

// The car park plate sits above this point. The motorcycle plate moves down by its own height.
export function motorcycleShift(shared: boolean, plateHeight: number): [number, number] | null {
  if (!shared || !(plateHeight > 0)) return null
  return [0, plateHeight]
}

export function parksNear<T extends ParkingPark>(parks: readonly T[], lng: number, lat: number, radiusM: number, cap = PARK_CAP): T[] {
  const near = parks.flatMap((park) => {
    const metres = metresBetween(lng, lat, park.lng, park.lat)
    if (metres > radiusM) return []
    return [{ park, metres }]
  })
  near.sort((a, b) => a.metres - b.metres)
  return near.slice(0, cap).map((item) => item.park)
}

function metresBetween(lng: number, lat: number, parkLng: number, parkLat: number): number {
  const radius = 6_371_000
  const fromLat = (lat * Math.PI) / 180
  const toLat = (parkLat * Math.PI) / 180
  const dLat = ((parkLat - lat) * Math.PI) / 180
  const dLng = ((parkLng - lng) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(a))
}

export function parseParkingParks(body: unknown): ParkingPark[] {
  if (!body || typeof body !== "object" || !("car_park" in body) || !Array.isArray(body.car_park)) return []
  return body.car_park.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const id = text(row.park_id)
    const lng = number(row.longitude)
    const lat = number(row.latitude)
    if (!id || lng == null || lat == null) return []
    const height = number(row.height)
    return [
      {
        id,
        nameTc: text(row.name_tc),
        nameEn: text(row.name_en),
        addressTc: text(row.displayAddress_tc),
        addressEn: text(row.displayAddress_en),
        lng,
        lat,
        heightM: height != null && height > 0 ? height : null,
      },
    ]
  })
}

export function parseParkingSpaces(body: unknown, id: string): ParkingSpace[] {
  if (!body || typeof body !== "object" || !("car_park" in body) || !Array.isArray(body.car_park)) return []
  const park = body.car_park.find((item) => item && typeof item === "object" && text((item as Record<string, unknown>).park_id) === id)
  if (!park || typeof park !== "object") return []
  const types = (park as Record<string, unknown>).vehicle_type
  if (!Array.isArray(types)) return []
  const spaces: ParkingSpace[] = []
  for (const item of types) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const kind = kindOf(text(row.type))
    if (!kind) continue
    const category = hourlyCategory(row.service_category)
    if (!category) continue
    const reading = vacancyState(text(category.vacancy_type), number(category.vacancy))
    spaces.push({
      kind,
      state: reading.state,
      vacancy: reading.vacancy,
      ev: null,
      updated: text(category.lastupdate),
    })
  }
  return spaces
}

function hourlyCategory(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) return null
  const rows = value.flatMap((item) => (item && typeof item === "object" ? [item as Record<string, unknown>] : []))
  return rows.find((row) => text(row.category) === "HOURLY") ?? rows[0] ?? null
}

export function publishedPrivateVacancies(body: unknown): Map<string, number> {
  const counts = new Map<string, number>()
  if (!body || typeof body !== "object" || !("car_park" in body) || !Array.isArray(body.car_park)) return counts
  for (const item of body.car_park) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const id = text(row.park_id)
    if (!id || !Array.isArray(row.vehicle_type)) continue
    for (const typeRow of row.vehicle_type) {
      if (!typeRow || typeof typeRow !== "object") continue
      const typed = typeRow as Record<string, unknown>
      if (text(typed.type) !== "P") continue
      const category = hourlyCategory(typed.service_category)
      if (!category || text(category.vacancy_type) !== "A") continue
      const vacancy = number(category.vacancy)
      if (vacancy != null && vacancy >= 0) counts.set(id, vacancy)
    }
  }
  return counts
}

export function publishedMotorcycleVacancies(body: unknown): Map<string, number> {
  const counts = new Map<string, number>()
  if (!body || typeof body !== "object" || !("car_park" in body) || !Array.isArray(body.car_park)) return counts
  for (const item of body.car_park) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const id = text(row.park_id)
    if (!id || !Array.isArray(row.vehicle_type)) continue
    for (const typeRow of row.vehicle_type) {
      if (!typeRow || typeof typeRow !== "object") continue
      const typed = typeRow as Record<string, unknown>
      if (text(typed.type) !== "M") continue
      const category = hourlyCategory(typed.service_category)
      if (!category || text(category.vacancy_type) !== "A") continue
      const vacancy = number(category.vacancy)
      if (vacancy != null && vacancy >= 0) counts.set(id, vacancy)
    }
  }
  return counts
}

const SAME_SITE_M = 80

export function parseOneStopParks(chinese: unknown, english: unknown): ParkingPark[] {
  const englishNames = new Map<string, { name: string; address: string }>()
  for (const row of results(english)) {
    const id = text(row.park_Id)
    if (!id) continue
    englishNames.set(id, { name: text(row.name), address: text(row.displayAddress) })
  }
  const parks = results(chinese).flatMap((row) => {
    const id = text(row.park_Id)
    const lng = number(row.longitude)
    const lat = number(row.latitude)
    if (!id || lng == null || lat == null) return []
    const translated = englishNames.get(id)
    return [
      {
        id,
        nameTc: text(row.name),
        nameEn: translated?.name ?? "",
        addressTc: text(row.displayAddress),
        addressEn: translated?.address ?? "",
        lng,
        lat,
        heightM: heightOf(row.heightLimits),
      },
    ]
  })
  return collapseSameSites(parks)
}

export function collapseSameSites(parks: readonly ParkingPark[]): ParkingPark[] {
  const parent = parks.map((_, index) => index)
  const find = (index: number): number => {
    const root = parent[index]
    if (root === undefined || root === index) return index
    const next = find(root)
    parent[index] = next
    return next
  }
  for (let left = 0; left < parks.length; left += 1) {
    for (let right = left + 1; right < parks.length; right += 1) {
      const a = parks[left]
      const b = parks[right]
      if (!a || !b || !sameSite(a, b)) continue
      parent[find(right)] = find(left)
    }
  }
  const groups = new Map<number, ParkingPark>()
  for (let index = 0; index < parks.length; index += 1) {
    const park = parks[index]
    if (!park) continue
    const root = find(index)
    const current = groups.get(root)
    groups.set(root, current ? preferPark(current, park) : park)
  }
  return [...groups.values()]
}

export function parseOneStopSpaces(body: unknown, id: string): ParkingSpace[] {
  const park = results(body).find((row) => text(row.park_Id) === id)
  if (!park) return []
  const spaces: ParkingSpace[] = []
  for (const [field, kind] of ONE_STOP_KINDS) {
    const row = firstReading(park[field])
    if (!row) continue
    const reading = vacancyState(text(row.vacancy_type), number(row.vacancy))
    const ev = number(row.vacancyEV)
    spaces.push({
      kind,
      state: reading.state,
      vacancy: reading.vacancy,
      ev: ev != null && ev >= 0 ? ev : null,
      updated: text(row.lastupdate),
    })
  }
  return spaces
}

export function oneStopCount(body: unknown, field: "privateCar" | "motorCycle"): Map<string, number> {
  const counts = new Map<string, number>()
  for (const park of results(body)) {
    const id = text(park.park_Id)
    const row = firstReading(park[field])
    if (!id || !row) continue
    const reading = vacancyState(text(row.vacancy_type), number(row.vacancy))
    if (reading.state === "number" && reading.vacancy != null) counts.set(id, reading.vacancy)
  }
  return counts
}

const ONE_STOP_KINDS = [
  ["privateCar", "private"],
  ["LGV", "lgv"],
  ["HGV", "hgv"],
  ["motorCycle", "motorcycle"],
] as const

function results(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== "object" || !("results" in body) || !Array.isArray(body.results)) return []
  return body.results.flatMap((item) => (item && typeof item === "object" ? [item as Record<string, unknown>] : []))
}

function heightOf(value: unknown): number | null {
  if (!Array.isArray(value)) return null
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const height = number((item as Record<string, unknown>).height)
    if (height != null && height > 0) return height
  }
  return null
}

function sameSite(left: ParkingPark, right: ParkingPark): boolean {
  const name = siteStem(left)
  const other = siteStem(right)
  if (!name || name !== other) return false
  return metresBetween(left.lng, left.lat, right.lng, right.lat) <= SAME_SITE_M
}

function siteStem(park: ParkingPark): string {
  const source = park.nameTc || park.nameEn
  return source
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/停車場|車場|泊車場|carpark|car park/g, "")
}

function preferPark(left: ParkingPark, right: ParkingPark): ParkingPark {
  const chosen = departmentRow(left, right)
  const other = chosen === left ? right : left
  if ((chosen.heightM == null || chosen.heightM <= 0) && other.heightM != null && other.heightM > 0) {
    return { ...chosen, heightM: other.heightM }
  }
  return chosen
}

function departmentRow(left: ParkingPark, right: ParkingPark): ParkingPark {
  const leftDepartment = left.id.startsWith("td")
  const rightDepartment = right.id.startsWith("td")
  if (leftDepartment && !rightDepartment) return left
  if (rightDepartment && !leftDepartment) return right
  const leftHeight = left.heightM ?? 0
  const rightHeight = right.heightM ?? 0
  if (leftHeight > 0 && rightHeight <= 0) return left
  if (rightHeight > 0 && leftHeight <= 0) return right
  return left.id < right.id ? left : right
}

function firstReading(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const row = value.find((item) => item && typeof item === "object")
    return row && typeof row === "object" ? row as Record<string, unknown> : null
  }
  if (value && typeof value === "object") return value as Record<string, unknown>
  return null
}

function vacancyState(type: string, vacancy: number | null): { state: ParkingState; vacancy: number | null } {
  if (type === "C") return { state: "closed", vacancy: null }
  if (type === "A" && vacancy != null && vacancy >= 0) return { state: "number", vacancy }
  return { state: "unpublished", vacancy: null }
}

function kindOf(type: string): ParkingKind | null {
  switch (type) {
    case "P":
      return "private"
    case "L":
      return "lgv"
    case "H":
      return "hgv"
    case "M":
      return "motorcycle"
    default:
      return null
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
