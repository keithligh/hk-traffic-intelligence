import { facingWord, parsePlace, type CameraPlace } from "@/lib/camera-place"
import {
  bandWord,
  controlName,
  displayText,
  districtFromTraditional,
  districtName,
  queueText,
  regionName,
  vehicleSentence,
  type Locale,
  type Messages,
} from "@/lib/i18n"
import type { TrainSpot } from "@/lib/mtr-estimate"
import { lineRecord, linesThrough, projectNetworkTrain, stationRecord } from "@/lib/mtr-network"
import { lrtRoutesThrough, lrtStation } from "@/lib/lrt-network"
import { isCameraSnapshotUrl } from "@/lib/picture"
import { isSpeedBand } from "@/lib/speed"
import { ferryBadge, ferryLeg } from "@/lib/ferry-routes"
import { boardFailedCopy, clearBoardFault, markBoardFault } from "@/lib/board-status"
import { routesWithoutArrival } from "@/lib/stop-routes"
import type { StopOperator } from "@/lib/stop-board"
import type { ParkingKind, ParkingSpace } from "@/lib/parking-parks"
import { shownChargerFree } from "@/lib/charger-free"
import { meterClock, type MeterKind, type MeterSpace } from "@/lib/meter-poles"
import type { ApproachPoint, HarbourJourney, LrtResponse, MtrCalling, MtrResponse, SpeedBand } from "@/lib/types"

const TUNNEL_TC: Record<string, string> = {
  "Western Harbour Crossing": "西區海底隧道",
  "Eastern Harbour Crossing": "東區海底隧道",
  "Cross Harbour Tunnel": "紅磡海底隧道",
  "Tai Lam Tunnel": "大欖隧道",
}

const BOUND_TC: Record<string, string> = {
  eastbound: "東行",
  westbound: "西行",
  northbound: "北行",
  southbound: "南行",
}

const BOUND_EN: Record<string, string> = {
  東行: "Eastbound",
  西行: "Westbound",
  北行: "Northbound",
  南行: "Southbound",
}

const SHORT_BOUND: Record<string, string> = {
  east: "eastbound",
  west: "westbound",
  north: "northbound",
  south: "southbound",
}

export function approachPopup(point: ApproachPoint, m: Messages): HTMLElement {
  const place = parsePlace(displayText(m.locale, point.nameTc, point.name))
  const card = openCard(place.road || displayText(m.locale, point.nameTc, point.name))
  const detail = placeLine(place, m)
  if (detail) card.head.append(paragraph("city-card-detail", detail))
  for (const leg of point.legs) {
    const name = crossingLegName(leg, m)
    const value = leg.minutes == null ? m.noReading : m.minutes(leg.minutes)
    card.body.append(fact(name, value, minuteTone(leg.colour)))
  }
  return card.root
}

export function corridorPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  const card = openCard(textProp(properties, "name") || m.roads)
  const direction = presentBound(textProp(properties, "direction"), m.locale)
  if (direction) card.head.append(paragraph("city-card-detail", direction))
  const speed = textProp(properties, "speed")
  const band = textProp(properties, "band")
  if (speed) card.body.append(fact(m.speedLayer, speed))
  if (isSpeedBand(band) && band !== "unknown") card.body.append(fact(m.classLabel, bandWord(band, m), bandTone(band)))
  return card.root
}

export function cameraPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  const description = displayText(m.locale, textProp(properties, "nameTc"), textProp(properties, "name"))
  const place = parsePlace(description)
  const card = openCard(place.road || description || m.cameras)
  const detail = placeLine(place, m)
  if (detail) card.head.append(paragraph("city-card-detail", detail))
  const district = localName(textProp(properties, "districtTc"), textProp(properties, "district"), districtName, m)
  const region = localName(textProp(properties, "regionTc"), textProp(properties, "region"), regionName, m)
  if (district) card.body.append(fact(m.districtLabel, district))
  if (region) card.body.append(fact(m.regionLabel, region))
  const rotation = numberProp(properties, "rotation")
  if (rotation != null) card.body.append(fact(m.facingLabel, m.facing(facingWord(rotation, m.locale))))
  if (place.reference) card.body.append(fact(m.referenceLabel, place.reference))
  const url = textProp(properties, "url")
  if (!isCameraSnapshotUrl(url)) return card.root
  const figure = document.createElement("figure")
  figure.className = "city-card-figure"
  const image = document.createElement("img")
  image.alt = [place.road, detail].filter(Boolean).join(m.locale === "en" ? ", " : "，")
  image.addEventListener("error", () => {
    figure.remove()
    card.root.append(paragraph("city-card-note", m.snapshotFailed))
  })
  image.src = `/api/camera?url=${encodeURIComponent(url)}`
  figure.append(image)
  card.root.append(figure)
  return card.root
}

export function controlPointPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  const title = controlName(m.locale, textProp(properties, "code"), textProp(properties, "name") || m.controlPoint)
  const card = openCard(title)
  card.head.append(paragraph("city-card-detail", m.passengerClearance))
  const rows = [
    [m.residentArrival, "residentArrCode", false],
    [m.residentDeparture, "residentDepCode", false],
    [m.visitorArrival, "visitorArrCode", true],
    [m.visitorDeparture, "visitorDepCode", true],
  ] as const
  for (const [label, key, visitor] of rows) {
    const code = properties?.[key]
    const value = typeof code === "number" ? queueText(code, visitor, m) : m.queueNone
    card.body.append(fact(label, value))
  }
  const roadName = displayText(m.locale, textProp(properties, "vehicleRoadTc"), textProp(properties, "vehicleRoadEn"))
  const kmh = properties?.vehicleKmh
  const band = textProp(properties, "vehicleBand")
  const vehicle =
    roadName && typeof kmh === "number" && band
      ? vehicleSentence(roadName, kmh, band, m)
      : ""
  if (vehicle) card.body.append(fact(m.vehicles, vehicle))
  else card.body.append(paragraph("city-card-copy", m.noVehicleApproach))
  return card.root
}

export function incidentPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  const title = displayText(m.locale, textProp(properties, "nameTc"), textProp(properties, "name")) || m.incident
  const card = openCard(title)
  const location = displayText(m.locale, textProp(properties, "location"), textProp(properties, "locationEn"))
  const direction = presentBound(
    displayText(m.locale, textProp(properties, "directionTc"), textProp(properties, "direction")),
    m.locale,
  )
  const place = [location, direction].filter(Boolean).join(" · ")
  if (place) card.head.append(paragraph("city-card-detail", place))
  const landmark = displayText(m.locale, textProp(properties, "landmark"), textProp(properties, "landmarkEn"))
  if (landmark) card.head.append(paragraph("city-card-detail", m.near(landmark)))
  const content = displayText(m.locale, textProp(properties, "contentTc"), textProp(properties, "content"))
  if (content) card.body.append(paragraph("city-card-copy", content))
  const announced = clock(hongKongStamp(textProp(properties, "announced")), m.locale)
  if (announced) card.body.append(fact(m.announcedLabel, announced))
  return card.root
}

export function workPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  const road = displayText(m.locale, textProp(properties, "roadTc"), textProp(properties, "road")) || m.roadWork
  const card = openCard(road)
  const place = displayText(m.locale, textProp(properties, "placeTc"), textProp(properties, "place"))
  const bound = presentBound(displayText(m.locale, textProp(properties, "boundTc"), textProp(properties, "bound")), m.locale)
  const lane = displayText(m.locale, textProp(properties, "laneTc"), textProp(properties, "lane"))
  const extra = placeRemainder(road, place)
  if (extra) card.head.append(paragraph("city-card-detail", extra))
  if (bound && !extra.includes(bound)) card.body.append(fact(m.boundLabel, bound))
  if (lane && !extra.includes(lane)) card.body.append(fact(m.laneLabel, lane))
  const kind = displayText(m.locale, textProp(properties, "kindTc"), textProp(properties, "kind"))
  if (kind) card.body.append(fact(m.works, kind))
  const status = workStatus(properties, m)
  if (status) card.body.append(fact(m.statusLabel, status))
  const district = localName(textProp(properties, "districtTc"), textProp(properties, "district"), districtName, m)
  if (district) card.body.append(fact(m.districtLabel, district))
  const when = timeRange(textProp(properties, "start"), textProp(properties, "end"), m.locale)
  if (when) card.body.append(fact(m.whenLabel, when))
  return card.root
}

export function lrtStationPopup(properties: GeoJSON.GeoJsonProperties, snapshot: LrtResponse | null, m: Messages): HTMLElement {
  const code = textProp(properties, "code")
  const record = lrtStation(code)
  const title = record ? displayText(m.locale, record.tc, record.en) : code || m.lrt
  const card = openCard(title)
  const routes = lrtRoutesThrough(code)
  if (routes.length > 0) card.head.append(paragraph("city-card-detail", routes.join(m.locale === "en" ? ", " : "、")))
  const listing = snapshot?.ok ? snapshot.boards.find((item) => item.station === code) : null
  if (!listing || listing.calls.length === 0) {
    card.body.append(paragraph("city-card-copy", snapshot?.ok ? m.lrtNone : m.lrtFailed))
    return card.root
  }
  const board = document.createElement("div")
  board.className = "city-card-board"
  for (const call of listing.calls) {
    const dest = displayText(m.locale, call.destTc, call.destEn)
    const when = call.timeType === "D" ? m.mtrDeparts(call.ttnt) : call.ttnt <= 0 ? m.lrtArriving : m.minutes(call.ttnt)
    board.append(serviceRow(`${call.route} ${m.towards(dest)}`, when, call.plat))
  }
  card.body.append(board)
  return card.root
}

export function lrtTrainPopup(properties: GeoJSON.GeoJsonProperties, snapshot: LrtResponse | null, m: Messages): HTMLElement {
  const listed = snapshot?.trains.find((item) => item.id === textProp(properties, "id"))
  const route = textProp(properties, "line") || listed?.line || ""
  const destCode = textProp(properties, "dest") || listed?.dest || ""
  const dest = lrtStation(destCode)
  const destName = dest ? displayText(m.locale, dest.tc, dest.en) : destCode || m.lrt
  const card = openCard(route ? `${route} ${m.towards(destName)}` : m.lrt)
  const from = textProp(properties, "from")
  const to = textProp(properties, "to")
  const next = lrtStation(to || from || listed?.anchor || "")
  const nextName = next ? displayText(m.locale, next.tc, next.en) : ""
  if (nextName) card.body.append(fact(m.mtrNext, nextName))
  const minutes = numberProp(properties, "minutes") ?? listed?.ttnt ?? 0
  const when = listed?.timeType === "D" && from === to ? m.mtrDeparts(minutes) : minutes <= 0 ? m.lrtArriving : m.minutes(minutes)
  card.body.append(fact(m.whenLabel, when))
  const plat = textProp(properties, "plat") || listed?.plat || ""
  if (plat) card.body.append(fact(m.mtrPlatform, plat))
  return card.root
}

const BOARD_MS = 60_000
const seenBoards = new Map<string, { at: number; calls: KmbBoardCall[]; routes: string[] }>()

function busStopPopup(properties: GeoJSON.GeoJsonProperties, m: Messages, title: string, empty: string, operator: StopOperator): HTMLElement {
  const heading = readablePlace(displayText(m.locale, textProp(properties, "nameTc"), textProp(properties, "nameEn"))) || title
  const card = openCard(heading)
  const id = textProp(properties, "id")
  const routes = routeList(properties)
  if (!id) {
    paintBoard(card.body, [], routes, m, empty)
    return card.root
  }
  mountStopBoard(card.body, operator, id, heading, m, empty, routes)
  return card.root
}

function mountStopBoard(body: HTMLElement, operator: StopOperator, id: string, name: string, m: Messages, empty: string, routes: string[]) {
  const key = `${operator}:${id}`
  const hit = seenBoards.get(key)
  if (hit && Date.now() - hit.at < BOARD_MS) {
    paintBoard(body, hit.calls, hit.routes, m, empty)
    return
  }
  body.replaceChildren(paragraph("city-card-copy", m.boardLoading))
  void fetch(`/api/board?op=${operator}&id=${encodeURIComponent(id)}`, { cache: "no-store" })
    .then((response) => response.json())
    .then((payload: unknown) => {
      if (!body.isConnected) return
      const stop = readStopBoard(payload)
      if (!stop) {
        markBoardFault({ operator, id, name })
        paintBoard(body, [], routes, m, boardFailedCopy(operator, m))
        return
      }
      clearBoardFault(operator, id)
      const nextRoutes = stop.routes.length > 0 ? stop.routes : routes
      seenBoards.set(key, { at: Date.now(), calls: stop.calls, routes: nextRoutes })
      paintBoard(body, stop.calls, nextRoutes, m, empty)
    })
    .catch(() => {
      if (!body.isConnected) return
      markBoardFault({ operator, id, name })
      paintBoard(body, [], routes, m, boardFailedCopy(operator, m))
    })
}

function paintBoard(body: HTMLElement, calls: KmbBoardCall[], routes: string[], m: Messages, empty: string) {
  body.replaceChildren()
  const quiet = routesWithoutArrival(routes, calls.map((call) => call.route))
  if (calls.length === 0 && quiet.length === 0) {
    body.append(paragraph("city-card-copy", empty))
    return
  }
  const board = document.createElement("div")
  board.className = "city-card-board"
  for (const call of calls) board.append(kmbCall(call, m))
  for (const route of quiet) board.append(routeOnly(route))
  body.append(board)
  if (calls.length === 0) body.append(paragraph("city-card-copy", empty))
}

function readStopBoard(payload: unknown): { calls: KmbBoardCall[]; routes: string[] } | null {
  if (typeof payload !== "object" || payload === null || !("ok" in payload) || payload.ok !== true) return null
  if (!("stop" in payload) || typeof payload.stop !== "object" || payload.stop === null) return null
  const stop = payload.stop as { routes?: unknown; calls?: unknown }
  const routes = Array.isArray(stop.routes) ? stop.routes.filter((item): item is string => typeof item === "string") : []
  const calls = Array.isArray(stop.calls) ? stop.calls.flatMap((item) => {
    if (typeof item !== "object" || item === null) return []
    const row = item as Record<string, unknown>
    const route = typeof row.route === "string" ? row.route : ""
    if (!route) return []
    return [{
      route,
      destTc: typeof row.destTc === "string" ? row.destTc : "",
      destEn: typeof row.destEn === "string" ? row.destEn : "",
      originTc: "",
      originEn: "",
      arriving: false,
      eta: typeof row.eta === "string" ? row.eta : "",
      minutes: typeof row.minutes === "number" ? row.minutes : null,
      scheduled: row.scheduled === true,
      remarkTc: typeof row.remarkTc === "string" ? row.remarkTc : "",
      remarkEn: typeof row.remarkEn === "string" ? row.remarkEn : "",
      company: row.company === "LWB" ? "LWB" as const : "KMB" as const,
    }]
  }) : []
  return { calls, routes }
}

function routeOnly(route: string): HTMLElement {
  const row = document.createElement("div")
  row.className = "city-card-call"
  row.append(text("span", "city-card-call-route", route))
  return row
}

function routeList(properties: GeoJSON.GeoJsonProperties): string[] {
  const raw = textProp(properties, "routes")
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string")
  } catch {
    return []
  }
}

export function citybusStopPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  return busStopPopup(properties, m, m.citybus, m.citybusNone, "citybus")
}

export function kmbStopPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  return busStopPopup(properties, m, m.kmb, m.kmbNone, "kmb")
}

export function gmbStopPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  return busStopPopup(properties, m, m.gmb, m.gmbNone, "gmb")
}

export function nlbStopPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  return busStopPopup(properties, m, m.nlb, m.nlbNone, "nlb")
}

export function mtrBusStopPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  return busStopPopup(properties, m, m.mtrBus, m.mtrBusNone, "mtrbus")
}

const seenParks = new Map<string, { at: number; spaces: ParkingSpace[] }>()

export function kerbPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  const street = readablePlace(displayText(m.locale, textProp(properties, "streetTc"), textProp(properties, "streetEn")))
  const card = openCard(street || m.kerb)
  const bays = numberProp(properties, "bays")
  const board = document.createElement("div")
  board.className = "city-card-board"
  board.append(serviceRow(m.kerb, bays != null && bays > 0 ? m.kerbBays(bays) : m.kerbFailed))
  card.body.append(board)
  return card.root
}

export function parkingPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  const heading = readablePlace(displayText(m.locale, textProp(properties, "nameTc"), textProp(properties, "nameEn"))) || m.parking
  const card = openCard(heading)
  const address = displayText(m.locale, textProp(properties, "addressTc"), textProp(properties, "addressEn"))
  if (address) card.head.append(paragraph("city-card-detail", address))
  const height = numberProp(properties, "heightM")
  if (height != null && height > 0) card.head.append(paragraph("city-card-detail", m.parkingHeight(height)))
  const hosted = readHostedChargers(textProp(properties, "hostedChargers"))
  if (hosted.length > 0) appendHostedChargers(card.head, hosted, m)
  else appendChargerCounts(card.head, properties, m)
  const id = textProp(properties, "id")
  if (!id) {
    card.body.append(paragraph("city-card-copy", m.parkingNone))
    return card.root
  }
  const leadMotorcycle = numberProp(properties, "motorcycle") != null
  const hit = seenParks.get(id)
  if (hit && Date.now() - hit.at < BOARD_MS) {
    paintParking(card.body, hit.spaces, m, leadMotorcycle)
    return card.root
  }
  card.body.replaceChildren(paragraph("city-card-copy", m.boardLoading))
  void fetch(`/api/parking/vacancy?id=${encodeURIComponent(id)}`, { cache: "no-store" })
    .then((response) => response.json())
    .then((payload: unknown) => {
      if (!card.body.isConnected) return
      const spaces = readParkingSpaces(payload)
      if (!spaces) {
        card.body.replaceChildren(paragraph("city-card-copy", m.parkingFailed))
        return
      }
      seenParks.set(id, { at: Date.now(), spaces })
      paintParking(card.body, spaces, m, leadMotorcycle)
    })
    .catch(() => {
      if (!card.body.isConnected) return
      card.body.replaceChildren(paragraph("city-card-copy", m.parkingFailed))
    })
  return card.root
}

function paintParking(body: HTMLElement, spaces: ParkingSpace[], m: Messages, leadMotorcycle = false) {
  body.replaceChildren()
  if (spaces.length === 0) {
    body.append(paragraph("city-card-copy", m.parkingNone))
    return
  }
  const ordered = leadMotorcycle ? [...spaces].sort((a, b) => Number(b.kind === "motorcycle") - Number(a.kind === "motorcycle")) : spaces
  const board = document.createElement("div")
  board.className = "city-card-board"
  for (const space of ordered) {
    board.append(serviceRow(parkingKindLabel(space.kind, m), parkingCount(space, m)))
    if (space.kind === "private" && space.ev != null) board.append(serviceRow(m.parkingEv, m.parkingSpaces(space.ev)))
  }
  body.append(board)
}

function parkingCount(space: ParkingSpace, m: Messages): string {
  if (space.state === "closed") return m.parkingClosed
  if (space.state === "unpublished") return m.parkingUnpublished
  const count = space.vacancy == null ? m.parkingUnpublished : m.parkingSpaces(space.vacancy)
  const time = /(\d{2}:\d{2})/.exec(space.updated)?.[1] ?? ""
  return time ? m.parkingAsOf(count, time) : count
}

function parkingKindLabel(kind: ParkingKind, m: Messages): string {
  switch (kind) {
    case "private":
      return m.parkingPrivate
    case "lgv":
      return m.parkingLgv
    case "hgv":
      return m.parkingHgv
    case "motorcycle":
      return m.parkingMotorcycle
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

export function chargerPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  const heading = readablePlace(displayText(m.locale, textProp(properties, "nameTc"), textProp(properties, "nameEn"))) || m.charger
  const card = openCard(heading)
  const district = districtFromTraditional(m.locale, textProp(properties, "districtTc"))
  if (district) card.head.append(paragraph("city-card-detail", district))
  appendChargerCounts(card.head, properties, m, shownChargerFree(properties?.free))
  return card.root
}

type HostedCharger = {
  nameTc: string
  nameEn: string
  standard: number
  medium: number
  quick: number
  fast: number
  free: number | null
}

function readHostedChargers(raw: string): HostedCharger[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const row = item as GeoJSON.GeoJsonProperties
      return [{
        nameTc: textProp(row, "nameTc"),
        nameEn: textProp(row, "nameEn"),
        standard: countProp(row, "standard"),
        medium: countProp(row, "medium"),
        quick: countProp(row, "quick"),
        fast: countProp(row, "fast"),
        free: shownChargerFree(row?.free),
      }]
    })
  } catch {
    return []
  }
}

function appendHostedChargers(parent: HTMLElement, chargers: readonly HostedCharger[], m: Messages) {
  const unique: HostedCharger[] = []
  const seen = new Set<string>()
  for (const charger of chargers) {
    const face = [charger.standard, charger.medium, charger.quick, charger.fast, charger.free ?? ""].join(":")
    if (seen.has(face)) continue
    seen.add(face)
    unique.push(charger)
  }
  const plugs = unique.some((charger) => charger.standard > 0 || charger.medium > 0 || charger.quick > 0 || charger.fast > 0)
  const frees = unique.some((charger) => charger.free != null)
  if (!plugs && !frees) return
  if (plugs) parent.append(paragraph("city-card-detail", m.chargerList))
  const board = document.createElement("div")
  board.className = "city-card-board"
  for (const charger of unique) {
    if (unique.length > 1) {
      const name = displayText(m.locale, charger.nameTc, charger.nameEn)
      if (name) board.append(paragraph("city-card-detail", name))
    }
    for (const [label, count] of [
      [m.chargerStandard, charger.standard],
      [m.chargerMedium, charger.medium],
      [m.chargerQuick, charger.quick],
      [m.chargerFast, charger.fast],
    ] as const) {
      if (count > 0) board.append(serviceRow(label, m.chargerPlugs(count)))
    }
    if (charger.free != null) board.append(serviceRow(m.plateFree, m.chargerPlugs(charger.free)))
  }
  parent.append(board)
}

function appendChargerCounts(parent: HTMLElement, properties: GeoJSON.GeoJsonProperties, m: Messages, free: number | null = null) {
  const rows = [
    [m.chargerStandard, countProp(properties, "standard")],
    [m.chargerMedium, countProp(properties, "medium")],
    [m.chargerQuick, countProp(properties, "quick")],
    [m.chargerFast, countProp(properties, "fast")],
  ] as const
  const shown = rows.filter(([, count]) => count > 0)
  if (shown.length === 0 && free == null) return
  if (shown.length > 0) parent.append(paragraph("city-card-detail", m.chargerList))
  const board = document.createElement("div")
  board.className = "city-card-board"
  for (const [label, count] of shown) board.append(serviceRow(label, m.chargerPlugs(count)))
  if (free != null) board.append(serviceRow(m.plateFree, m.chargerPlugs(free)))
  parent.append(board)
}

function countProp(properties: GeoJSON.GeoJsonProperties, key: string): number {
  const value = properties?.[key]
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value)
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return 0
}

export function meterPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  const street = readablePlace(displayText(m.locale, textProp(properties, "streetTc"), textProp(properties, "streetEn"))) || m.meter
  const card = openCard(street)
  const section = displayText(m.locale, textProp(properties, "sectionTc"), textProp(properties, "sectionEn"))
  if (section) card.head.append(paragraph("city-card-detail", section))
  const spaces = readMeterSpaces(textProp(properties, "spaces"))
  if (spaces.length === 0) {
    card.body.append(paragraph("city-card-copy", m.meterFailed))
    return card.root
  }
  const board = document.createElement("div")
  board.className = "city-card-board"
  for (const space of spaces) board.append(serviceRow(meterKindLabel(space.kind, m), meterState(space, m)))
  card.body.append(board)
  return card.root
}

function meterState(space: MeterSpace, m: Messages): string {
  const time = meterClock(space.updated)
  if (space.vacant === true) return time ? m.meterSince(m.meterVacant, time) : m.meterVacant
  if (space.vacant === false) return time ? m.meterSince(m.meterTaken, time) : m.meterTaken
  return m.meterClosed
}

function meterKindLabel(kind: MeterKind, m: Messages): string {
  switch (kind) {
    case "general":
      return m.meterGeneral
    case "goods":
      return m.meterGoods
    case "coach":
      return m.meterCoach
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

function readMeterSpaces(raw: string): MeterSpace[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const row = item as { id?: unknown; kind?: unknown; vacant?: unknown; updated?: unknown }
      if (row.kind !== "general" && row.kind !== "goods" && row.kind !== "coach") return []
      const vacant = row.vacant === true ? true : row.vacant === false ? false : null
      return [{ id: typeof row.id === "string" ? row.id : "", kind: row.kind, vacant, updated: typeof row.updated === "string" ? row.updated : "" }]
    })
  } catch {
    return []
  }
}

function readParkingSpaces(payload: unknown): ParkingSpace[] | null {
  if (typeof payload !== "object" || payload === null || !("ok" in payload) || payload.ok !== true) return null
  if (!("spaces" in payload) || !Array.isArray(payload.spaces)) return null
  return payload.spaces.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as { kind?: unknown; state?: unknown; vacancy?: unknown; ev?: unknown; updated?: unknown }
    if (row.kind !== "private" && row.kind !== "lgv" && row.kind !== "hgv" && row.kind !== "motorcycle") return []
    const vacancy = typeof row.vacancy === "number" && Number.isFinite(row.vacancy) ? row.vacancy : null
    const ev = typeof row.ev === "number" && Number.isFinite(row.ev) && row.ev >= 0 ? row.ev : null
    const state = row.state === "number" || row.state === "unpublished" || row.state === "closed"
      ? row.state
      : vacancy == null
        ? "unpublished"
        : "number"
    return [{ kind: row.kind, state, vacancy, ev, updated: typeof row.updated === "string" ? row.updated : "" }]
  })
}

export function ferryStopPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  const heading = readablePlace(displayText(m.locale, textProp(properties, "nameTc"), textProp(properties, "nameEn"))) || m.ferry
  const card = openCard(heading)
  const calls = kmbBoard(properties)
  if (calls.length === 0) {
    card.body.append(paragraph("city-card-copy", m.ferryNone))
    return card.root
  }
  const board = document.createElement("div")
  board.className = "city-card-board"
  for (const call of calls) board.append(ferryCall(call, m))
  card.body.append(board)
  return card.root
}

function ferryCall(call: KmbBoardCall, m: Messages): HTMLElement {
  const row = document.createElement("div")
  row.className = call.scheduled ? "city-card-call city-card-call-plain city-card-call-timetable" : "city-card-call city-card-call-plain"
  const badge = ferryBadge(call.route)
  const service = displayText(m.locale, badge.tc, badge.en)
  const leg = ferryLeg(call)
  const place = leg ? readablePlace(displayText(m.locale, leg.tc, leg.en)) : ""
  const remark = displayText(m.locale, call.remarkTc, call.remarkEn)
  const headline = place ? (leg?.arriving ? m.fromPlace(place) : m.towards(place)) : service
  const when = call.minutes == null ? remark || clock(call.eta, m.locale) : m.minutes(call.minutes)
  row.append(
    text("span", "city-card-call-dest", headline),
    text("span", "city-card-call-when", when),
  )
  const note = call.scheduled ? remark || service : call.minutes != null && remark ? remark : ""
  const kind = note || (service && place && service !== place ? service : "")
  if (kind && kind !== headline) row.append(text("span", "city-card-call-kind", kind))
  return row
}

function kmbCall(call: KmbBoardCall, m: Messages): HTMLElement {
  const row = document.createElement("div")
  row.className = call.scheduled ? "city-card-call city-card-call-timetable" : "city-card-call"
  const dest = readablePlace(displayText(m.locale, call.destTc, call.destEn))
  const when = call.minutes == null ? clock(call.eta, m.locale) : m.minutes(call.minutes)
  const remark = displayText(m.locale, call.remarkTc, call.remarkEn)
  const kind = call.scheduled ? m.kmbScheduled : when ? "" : remark
  row.append(
    text("span", "city-card-call-route", call.company === "LWB" ? `${call.route} ${m.lwb}` : call.route),
    text("span", "city-card-call-dest", dest ? m.towards(dest) : ""),
    text("span", "city-card-call-when", when),
  )
  if (kind) row.append(text("span", "city-card-call-kind", kind))
  return row
}

const PLACE_ACRONYMS = new Set(["BBI", "MTR", "KMB", "LWB", "HK", "PTI", "GMB", "CTB", "NWFB"])

export function readablePlace(value: string): string {
  const shaped = /[\u4e00-\u9fff]/.test(value) ? value.replace(/,/g, "，") : value
  const letters = shaped.replace(/[^A-Za-z]/g, "")
  if (!letters || letters !== letters.toUpperCase()) return shaped
  return shaped.replace(/[A-Za-z]+/g, (word, index: number) => {
    const next = shaped[index + word.length]
    if (next && /\d/.test(next)) return word
    if (PLACE_ACRONYMS.has(word)) return word
    return word.charAt(0) + word.slice(1).toLowerCase()
  })
}

type KmbBoardCall = {
  route: string
  destTc: string
  destEn: string
  originTc: string
  originEn: string
  arriving: boolean
  eta: string
  minutes: number | null
  scheduled: boolean
  remarkTc: string
  remarkEn: string
  company?: "KMB" | "LWB"
}

function kmbBoard(properties: GeoJSON.GeoJsonProperties): KmbBoardCall[] {
  const raw = textProp(properties, "board")
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (typeof item !== "object" || item === null) return []
      const row = item as Record<string, unknown>
      const route = typeof row.route === "string" ? row.route : ""
      if (!route) return []
      return [{
        route,
        destTc: typeof row.destTc === "string" ? row.destTc : "",
        destEn: typeof row.destEn === "string" ? row.destEn : "",
        originTc: typeof row.originTc === "string" ? row.originTc : "",
        originEn: typeof row.originEn === "string" ? row.originEn : "",
        arriving: row.arriving === true,
        eta: typeof row.eta === "string" ? row.eta : "",
        minutes: typeof row.minutes === "number" ? row.minutes : null,
        scheduled: row.scheduled === true,
        remarkTc: typeof row.remarkTc === "string" ? row.remarkTc : "",
        remarkEn: typeof row.remarkEn === "string" ? row.remarkEn : "",
        company: row.company === "LWB" ? "LWB" : "KMB",
      }]
    })
  } catch {
    return []
  }
}

export function stationPopup(properties: GeoJSON.GeoJsonProperties, snapshot: MtrResponse | null, m: Messages): HTMLElement {
  const code = textProp(properties, "code")
  const record = stationRecord(code)
  const title = record ? displayText(m.locale, record.tc, record.en) : code || m.mtr
  const card = openCard(title)
  const lines = linesThrough(code)
  const lineNames = lines.map((line) => lineLabel(line, m)).filter(Boolean)
  if (lineNames.length > 0) card.head.append(paragraph("city-card-detail", lineNames.join(m.locale === "en" ? ", " : "、")))
  if (!snapshot?.ok) {
    card.body.append(paragraph("city-card-copy", m.mtrFailed))
    return card.root
  }
  const board = document.createElement("div")
  board.className = "city-card-board"
  let anyTrain = false
  for (const line of lines) {
    const listing = snapshot.boards.find((item) => item.line === line && item.station === code)
    if (lines.length > 1) board.append(paragraph("city-card-section", lineLabel(line, m)))
    if (!listing) {
      board.append(paragraph("city-card-copy", m.noReading))
      continue
    }
    if (listing.message) board.append(paragraph("city-card-copy", listing.message))
    const callings = nextByDest(listing.trains ?? [])
    if (callings.length === 0) {
      board.append(paragraph("city-card-copy", m.mtrNoTrain))
      continue
    }
    anyTrain = true
    for (const calling of callings) {
      const dest = stationRecord(calling.dest)
      const destName = dest ? displayText(m.locale, dest.tc, dest.en) : calling.dest
      const when = calling.timeType === "D" ? m.mtrDeparts(calling.ttnt) : calling.ttnt <= 0 ? m.mtrArriving : m.minutes(calling.ttnt)
      const platform = calling.plat ? m.mtrDue("", calling.plat).replace(/^\s*·\s*/, "") : ""
      board.append(serviceRow(m.towards(destName), when, platform, calling.delay ? "#8a5a00" : undefined))
    }
  }
  if (!anyTrain && lines.length === 0) card.body.append(paragraph("city-card-copy", m.mtrNoTrain))
  else card.body.append(board)
  return card.root
}

export function trainPopup(properties: GeoJSON.GeoJsonProperties, snapshot: MtrResponse | null, m: Messages): HTMLElement {
  const listed = snapshot?.trains.find((item) => item.id === textProp(properties, "id"))
  const lineCode = textProp(properties, "line") || listed?.line || ""
  const destCode = textProp(properties, "dest") || listed?.dest || ""
  const from = textProp(properties, "from")
  const to = textProp(properties, "to")
  if (!lineCode && !listed) {
    const card = openCard(m.mtr)
    card.body.append(paragraph("city-card-copy", m.mtrNoTrain))
    return card.root
  }
  const dest = stationRecord(destCode)
  const destName = dest ? displayText(m.locale, dest.tc, dest.en) : destCode || m.mtr
  const card = openCard(m.towards(destName))
  const line = lineLabel(lineCode, m)
  if (line) card.head.append(paragraph("city-card-detail", line))
  const timeType = textProp(properties, "timeType") === "D" || listed?.timeType === "D" ? "D" : "A"
  const delay = textProp(properties, "delay") === "Y" || listed?.delay === true
  const standing = textProp(properties, "standing") === "Y"
  const plat = textProp(properties, "plat") || (standing ? "" : listed?.plat ?? "")
  const minutesOnDot = numberProp(properties, "minutes")
  const clampText = textProp(properties, "clamp")
  const clamp = clampText === "origin" || clampText === "junction" ? clampText : "none"
  const shown =
    from && to && minutesOnDot != null
      ? { lng: 0, lat: 0, from, to, clamp, minutes: minutesOnDot }
      : listed
        ? projectNetworkTrain(listed, Date.now())
        : null
  const riding = shown != null && shown.from !== shown.to && !standing
  const upcoming = textProp(properties, "next")
  const nextCode = standing ? upcoming : riding && shown ? shown.to : from || listed?.anchor || ""
  const next = stationRecord(nextCode)
  const nextName = next ? displayText(m.locale, next.tc, next.en) : nextCode
  if (nextName && (riding || standing || timeType !== "D")) card.body.append(fact(m.mtrNext, nextName))
  const minutes = shown ? Math.max(0, Math.round(shown.minutes)) : listed?.ttnt ?? 0
  const when =
    standing && shown?.clamp === "origin" && minutes > 0
      ? m.mtrDeparts(minutes)
      : !riding && timeType === "D"
        ? m.mtrDeparts(minutes)
        : minutes <= 0
          ? m.mtrArriving
          : m.minutes(minutes)
  card.body.append(fact(m.whenLabel, when, delay ? "#8a5a00" : undefined))
  if (plat) card.body.append(fact(m.mtrPlatform, plat))
  if (shown) card.body.append(fact(m.mtrPosition, positionSentence(shown, m)))
  if (delay) card.body.append(fact(m.statusLabel, m.mtrDelayed, "#8a5a00"))
  card.body.append(paragraph("city-card-aside", m.mtrMethod))
  return card.root
}

export function tollPopup(properties: GeoJSON.GeoJsonProperties, m: Messages): HTMLElement {
  const name = textProp(properties, "name")
  const card = openCard(displayText(m.locale, TUNNEL_TC[name] ?? "", name) || m.tunnel)
  if (textProp(properties, "band") === "portal") card.head.append(paragraph("city-card-detail", m.tunnelPortal))
  return card.root
}

function lineLabel(code: string, m: Messages): string {
  const line = lineRecord(code)
  if (!line) return code
  return displayText(m.locale, line.tc, line.en)
}

function nextByDest(trains: MtrCalling[]): MtrCalling[] {
  const best = new Map<string, MtrCalling>()
  for (const train of trains) {
    const current = best.get(train.dest)
    if (!current || train.ttnt < current.ttnt) best.set(train.dest, train)
  }
  return [...best.values()].sort((a, b) => a.ttnt - b.ttnt || (a.dest < b.dest ? -1 : 1))
}

function positionSentence(spot: TrainSpot, m: Messages): string {
  const from = stationRecord(spot.from)
  const to = stationRecord(spot.to)
  const fromName = from ? displayText(m.locale, from.tc, from.en) : spot.from
  const toName = to ? displayText(m.locale, to.tc, to.en) : spot.to
  if (spot.clamp === "junction") return m.mtrHeld(toName)
  if (spot.clamp === "origin" || spot.from === spot.to) return m.mtrHere(fromName)
  return m.mtrBetween(fromName, toName)
}

function crossingLegName(leg: ApproachPoint["legs"][number], m: Messages): string {
  if (leg.code === "CH") return m.crossFull
  if (leg.code === "EH") return m.easternFull
  if (leg.code === "WH") return m.westernFull
  return displayText(m.locale, leg.nameTc, leg.name)
}

function placeLine(place: CameraPlace, m: Messages): string {
  const parts = [
    place.bound ? presentBound(place.bound, m.locale) : "",
    place.side,
    place.near ? m.near(place.near) : "",
    place.towards ? m.towards(place.towards) : "",
  ].filter(Boolean)
  return parts.join(" · ")
}

function presentBound(bound: string, locale: Locale): string {
  const expanded = SHORT_BOUND[bound.trim().toLowerCase()]
  const source = expanded ?? bound
  const match = source.match(/^([東南西北东]行|(?:east|west|north|south)bound)(?:\s+(\(\d+\)))?$/i)
  if (!match?.[1]) return bound
  const index = match[2] ? ` ${match[2]}` : ""
  const token = match[1].toLowerCase()
  if (token.endsWith("bound")) {
    const english = token.charAt(0).toUpperCase() + token.slice(1)
    const word = locale === "en" ? english : displayText(locale, BOUND_TC[token] ?? "", english)
    return `${word}${index}`
  }
  const traditional = token === "东行" ? "東行" : match[1]
  const word = locale === "en" ? BOUND_EN[traditional] ?? traditional : displayText(locale, traditional, BOUND_EN[traditional] ?? "")
  return `${word}${index}`
}

function localName(
  traditional: string,
  english: string,
  fallback: (locale: Locale, english: string) => string,
  m: Messages,
): string {
  if (traditional) return displayText(m.locale, traditional, english)
  return fallback(m.locale, english)
}

function workStatus(properties: GeoJSON.GeoJsonProperties, m: Messages): string {
  const traditional = textProp(properties, "statusTc")
  const english = textProp(properties, "status")
  if (traditional) return displayText(m.locale, traditional, english)
  if (/in progress/i.test(english)) return m.worksLive
  if (/preparation/i.test(english)) return m.worksPrep
  return english
}

function placeRemainder(road: string, place: string): string {
  let rest = place.trim()
  if (!rest || rest === road) return ""
  if (road && rest.startsWith(road)) rest = rest.slice(road.length).replace(/^[\s,，、:：\-–—]+/, "").trim()
  return rest
}

function openCard(title: string): { root: HTMLElement; head: HTMLElement; body: HTMLElement } {
  const root = document.createElement("article")
  root.className = "city-card"
  const head = document.createElement("header")
  head.className = "city-card-head"
  head.append(text("h2", "city-card-title", title))
  const body = document.createElement("div")
  body.className = "city-card-body"
  root.append(head, body)
  return { root, head, body }
}

function serviceRow(primary: string, when: string, kind = "", tone?: string): HTMLElement {
  const row = document.createElement("div")
  row.className = "city-card-call city-card-call-plain"
  const whenNode = text("span", "city-card-call-when", when)
  if (tone) whenNode.style.color = tone
  row.append(text("span", "city-card-call-dest", primary), whenNode)
  if (kind) row.append(text("span", "city-card-call-kind", kind))
  return row
}

function fact(label: string, value: string, tone?: string): HTMLElement {
  const row = document.createElement("div")
  row.className = "city-card-fact"
  row.append(text("span", "city-card-fact-label", label))
  const valueNode = text("span", "city-card-fact-value", value)
  if (tone) valueNode.style.color = tone
  row.append(valueNode)
  return row
}

function paragraph(className: string, value: string): HTMLElement {
  return text("p", className, value)
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (value) node.textContent = value
  return node
}

function minuteTone(colour: HarbourJourney["colour"]): string {
  switch (colour) {
    case "red":
      return "#b42318"
    case "amber":
      return "#8a5a00"
    case "green":
      return "#0b7a45"
    case "none":
      return "#102033"
    default: {
      const exhaustive: never = colour
      return exhaustive
    }
  }
}

function bandTone(band: SpeedBand): string {
  switch (band) {
    case "free":
      return "#0b7a45"
    case "slow":
      return "#8a5a00"
    case "congested":
      return "#b42318"
    case "unknown":
      return "#102033"
    default: {
      const exhaustive: never = band
      return exhaustive
    }
  }
}

function timeRange(start: string, end: string, locale: Locale): string {
  const from = clock(start, locale)
  const to = clock(end, locale)
  if (from && to) return `${from} – ${to}`
  return from || to
}

function hongKongStamp(value: string): string {
  if (!value || /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return value
  return `${value}+08:00`
}

function clock(value: string, locale: Locale): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  if (locale === "en") {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Hong_Kong",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      day: "numeric",
      month: "short",
    }).format(date)
  }
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    day: "numeric",
    month: "numeric",
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ""
  return `${part("month")}月${part("day")}日 ${part("hour")}:${part("minute")}`
}

function numberProp(properties: GeoJSON.GeoJsonProperties, key: string): number | null {
  const value = properties?.[key]
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value
}

function textProp(properties: GeoJSON.GeoJsonProperties, key: string): string {
  const value = properties?.[key]
  return typeof value === "string" ? value : ""
}
