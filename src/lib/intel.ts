import { boardFailedCopy, type BoardFault } from "./board-status.ts"
import { warnedCrossings } from "./crossings.ts"
import { controlName, displayText, hallStatus, hallSummary, vehicleSentence, type Messages } from "./i18n.ts"
import type { ApproachPoint, Corridor, TrafficResponse, WeatherConditions, WeatherWarning } from "./types.ts"

export type IntelKind = "fault" | "incident" | "control" | "crossing" | "jam" | "works" | "slow" | "weather"

export type IntelTone = "red" | "amber" | "green" | "none"

export type IntelItem = {
  id: string
  kind: IntelKind
  score: number
  urgent: boolean
  label: string
  title: string
  detail: string
  tone: IntelTone
  coordinates: [number, number] | null
}

export type IntelTab = "ranked" | "roads" | "boundary" | "weather" | "systems" | "notes"

export const INTEL_TABS: readonly IntelTab[] = ["ranked", "roads", "boundary", "weather", "systems", "notes"]

export type IntelInput = {
  trafficError: string | null
  traffic: TrafficResponse | null
  incidents: GeoJSON.FeatureCollection | null
  incidentsError: string | null
  works: GeoJSON.FeatureCollection | null
  controlPoints: GeoJSON.FeatureCollection | null
  controlError: string | null
  approaches: ApproachPoint[]
  approachesError: string | null
  warnings: WeatherWarning[]
  warningsReady: boolean
  warningsError: string | null
  conditions: WeatherConditions | null
  pictureError: string | null
  mtrError: string | null
  kmbError: string | null
  lrtError: string | null
  citybusError: string | null
  gmbError: string | null
  nlbError: string | null
  mtrBusError: string | null
  ferryError: string | null
  mapError: string | null
  boardFaults?: readonly BoardFault[]
}

const RANKED_LIMIT = 12

export function intelBoard(input: IntelInput, m: Messages): Record<IntelTab, IntelItem[]> {
  const incidents = incidentsOf(input.incidents, 8, m)
  const controls = controlPointsOf(input.controlPoints, 8, m)
  const crossings = crossingsOf(input.approaches, m)
  const jams = jamsOf(input.traffic?.ok ? input.traffic.corridors : [], 8, 3, m)
  const works = worksOf(input.works, 6, m)
  const warnings = warningsOf(input.warnings, m)
  const faults = faultsOf(input, m)
  const ranked = [...faults, ...incidents.slice(0, 5), ...controls, ...crossings, ...jams.slice(0, 6), ...works.slice(0, 4), ...warnings]
  ranked.sort(byScore)
  return {
    ranked: ranked.slice(0, RANKED_LIMIT),
    roads: [...faults.filter((item) => item.id === "fault-speed" || item.id === "fault-incidents"), ...incidents, ...jams, ...works].sort(byScore).slice(0, 16),
    boundary: boundaryOf(input, m),
    weather: weatherOf(input, warnings, m),
    systems: [...faults, ...boardFaultItems(input.boardFaults ?? [], m)].sort(byScore),
    notes: [],
  }
}

export function rankIntel(input: IntelInput, m: Messages): IntelItem[] {
  return intelBoard(input, m).ranked
}

function faultsOf(input: IntelInput, m: Messages): IntelItem[] {
  const items: IntelItem[] = []
  if (input.trafficError || (input.traffic && !input.traffic.ok)) {
    items.push(fault("fault-speed", 1_000_000, m.faultSpeed, input.trafficError || input.traffic?.error || m.faultSpeed, m))
  }
  if (input.incidentsError) items.push(fault("fault-incidents", 640_000, m.faultIncidents, input.incidentsError, m))
  if (input.approachesError) items.push(fault("fault-crossings", 620_000, m.faultCrossings, input.approachesError, m))
  if (input.controlError) items.push(fault("fault-boundary", 580_000, m.faultBoundary, input.controlError, m))
  if (input.warningsError) items.push(fault("fault-weather", 160_000, m.faultWeather, input.warningsError, m))
  const feeds: { id: string; score: number; title: string; detail: string | null }[] = [
    { id: "fault-picture", score: 420_000, title: m.pictureFailed, detail: input.pictureError },
    { id: "fault-mtr", score: 400_000, title: m.mtrFailed, detail: input.mtrError },
    { id: "fault-kmb", score: 390_000, title: m.kmbStopsFailed, detail: input.kmbError },
    { id: "fault-lrt", score: 380_000, title: m.lrtFailed, detail: input.lrtError },
    { id: "fault-citybus", score: 370_000, title: m.citybusStopsFailed, detail: input.citybusError },
    { id: "fault-gmb", score: 360_000, title: m.gmbStopsFailed, detail: input.gmbError },
    { id: "fault-nlb", score: 350_000, title: m.nlbStopsFailed, detail: input.nlbError },
    { id: "fault-mtrbus", score: 345_000, title: m.mtrBusStopsFailed, detail: input.mtrBusError },
    { id: "fault-ferry", score: 340_000, title: m.ferryFailed, detail: input.ferryError },
    { id: "fault-map", score: 1_200_000, title: m.mapFailed, detail: input.mapError },
  ]
  for (const feed of feeds) {
    if (feed.detail) items.push(fault(feed.id, feed.score, feed.title, feed.detail, m))
  }
  return items
}

function boardFaultItems(faults: readonly BoardFault[], m: Messages): IntelItem[] {
  return faults.map((item) => fault(`fault-board-${item.operator}-${item.id}`, 360_000, boardFailedCopy(item.operator, m), item.name, m))
}

function fault(id: string, score: number, title: string, detail: string, m: Messages): IntelItem {
  return {
    id,
    kind: "fault",
    score,
    urgent: score >= 500_000,
    label: m.fault,
    title,
    detail,
    tone: score >= 500_000 ? "red" : "amber",
    coordinates: null,
  }
}

function incidentsOf(collection: GeoJSON.FeatureCollection | null, limit: number, m: Messages): IntelItem[] {
  if (!collection) return []
  const rows = collection.features.map((feature, index) => ({
    feature,
    announced: textProp(feature.properties, "announced"),
    index,
  }))
  rows.sort((a, b) => b.announced.localeCompare(a.announced) || a.index - b.index)
  return rows.slice(0, limit).map((row, index) => {
    const location = displayText(m.locale, textProp(row.feature.properties, "location"), textProp(row.feature.properties, "locationEn"))
    const direction = displayText(m.locale, textProp(row.feature.properties, "directionTc"), textProp(row.feature.properties, "direction"))
    const sentence = displayText(m.locale, textProp(row.feature.properties, "contentTc"), textProp(row.feature.properties, "content"))
    return {
      id: `incident-${index}-${location}`,
      kind: "incident" as const,
      score: 800_000 - index,
      urgent: true,
      label: m.incident,
      title: clip(sentence || displayText(m.locale, textProp(row.feature.properties, "nameTc"), textProp(row.feature.properties, "name")) || m.incident, 160),
      detail: [location, direction].filter(Boolean).join(" · "),
      tone: "red" as const,
      coordinates: pointOf(row.feature),
    }
  })
}

function controlPointsOf(collection: GeoJSON.FeatureCollection | null, limit: number, m: Messages): IntelItem[] {
  if (!collection) return []
  const rows = collection.features.flatMap((feature) => {
    const worst = numberProp(feature.properties, "worst")
    if (hallClosed(worst)) return []
    const vehicleBand = textProp(feature.properties, "vehicleBand")
    const passengerHot = worst === 1 || worst === 2
    const vehicleHot = vehicleBand === "congested" || vehicleBand === "slow"
    if (!passengerHot && !vehicleHot) return []
    return [controlItem(feature, worst, vehicleBand, m)]
  })
  rows.sort(byScore)
  return rows.slice(0, limit)
}

export function firstOpenBoundary(items: readonly IntelItem[]): IntelItem | undefined {
  return items.find((item) => item.kind === "control" && item.coordinates && !hallClosedScore(item.score))
}

function boundaryOf(input: IntelInput, m: Messages): IntelItem[] {
  if (input.controlError) return [fault("fault-boundary", 580_000, m.faultBoundary, input.controlError, m)]
  if (!input.controlPoints) return []
  return input.controlPoints.features
    .map((feature) => controlItem(feature, numberProp(feature.properties, "worst"), textProp(feature.properties, "vehicleBand"), m))
    .sort(byScore)
}

const CLOSED_HALL = 500

function hallClosed(worst: number | null): boolean {
  return worst === 99 || worst === 4
}

function hallClosedScore(score: number): boolean {
  return score === CLOSED_HALL
}

function controlItem(feature: GeoJSON.Feature, worst: number | null, vehicleBand: string, m: Messages): IntelItem {
  const code = textProp(feature.properties, "code")
  const name = controlTitle(feature, m)
  const closed = hallClosed(worst)
  const veryBusy = !closed && (worst === 2 || vehicleBand === "congested")
  const score = closed
    ? CLOSED_HALL
    : worst === 2
      ? 750_000
      : vehicleBand === "congested"
        ? 420_000
        : worst === 1
          ? 230_000
          : vehicleBand === "slow"
            ? 60_000
            : 1_000
  return {
    id: `control-${code || name}`,
    kind: "control",
    score,
    urgent: veryBusy,
    label: hallStatus(worst, vehicleBand, m),
    title: name,
    detail: controlDetail(feature, m),
    tone: veryBusy ? "red" : worst === 1 || closed || vehicleBand === "slow" ? "amber" : "green",
    coordinates: pointOf(feature),
  }
}

function controlTitle(feature: GeoJSON.Feature, m: Messages): string {
  const code = textProp(feature.properties, "code")
  const english = textProp(feature.properties, "name") || m.controlPoint
  if (!code) return english
  return controlName(m.locale, code, english)
}

function controlDetail(feature: GeoJSON.Feature, m: Messages): string {
  const properties = feature.properties
  const rows = (
    [
      [m.residentArrival, numberProp(properties, "residentArrCode")],
      [m.residentDeparture, numberProp(properties, "residentDepCode")],
      [m.visitorArrival, numberProp(properties, "visitorArrCode")],
      [m.visitorDeparture, numberProp(properties, "visitorDepCode")],
    ] as const
  ).flatMap(([name, code]): [string, number][] => (code == null ? [] : [[name, code]]))
  const summary = rows.length > 0 ? hallSummary(rows, m) : ""
  if (hallClosed(numberProp(properties, "worst"))) return summary
  const road = displayText(m.locale, textProp(properties, "vehicleRoadTc"), textProp(properties, "vehicleRoadEn"))
  const vehicle = vehicleSentence(road, numberProp(properties, "vehicleKmh"), textProp(properties, "vehicleBand"), m)
  return [summary, vehicle].filter(Boolean).join(" · ")
}

function crossingsOf(points: ApproachPoint[], m: Messages): IntelItem[] {
  return warnedCrossings(points).map((row) => crossingItem(row.code, {
    minutes: row.minutes,
    from: displayText(m.locale, row.fromTc, row.from),
    tone: row.colour,
    coordinates: row.coordinates,
  }, m))
}

function crossingItem(
  code: string,
  row: { minutes: number; from: string; tone: IntelTone; coordinates: [number, number] },
  m: Messages,
): IntelItem {
  const full = code === "EH" ? m.easternFull : code === "WH" ? m.westernFull : m.crossFull
  return {
    id: `crossing-${code}`,
    kind: "crossing",
    score: (row.tone === "red" ? 600_000 : row.tone === "amber" ? 200_000 : 10_000) + row.minutes,
    urgent: row.tone === "red",
    label: m.crossing,
    title: `${full} ${m.minutes(row.minutes)}`,
    detail: row.from,
    tone: row.tone,
    coordinates: row.coordinates,
  }
}

function jamsOf(corridors: Corridor[], jamLimit: number, slowLimit: number, m: Messages): IntelItem[] {
  const roads = new Map<string, { title: string; speed: number; lengthKm: number; coordinates: [number, number] | null; band: "jam" | "slow" }>()
  for (const corridor of corridors) {
    if (corridor.speedKmh == null) continue
    if (corridor.band !== "congested" && corridor.band !== "slow") continue
    const title = displayText(m.locale, corridor.roadTc, corridor.roadEn) || m.roads
    const key = (corridor.roadEn || corridor.roadTc || title).toUpperCase()
    const band = corridor.band === "congested" ? "jam" : "slow"
    const current = roads.get(key)
    if (!current) {
      roads.set(key, {
        title,
        speed: corridor.speedKmh,
        lengthKm: corridor.lengthKm,
        coordinates: midpoint(corridor.coordinates),
        band,
      })
      continue
    }
    current.lengthKm += corridor.lengthKm
    if (band === "jam") current.band = "jam"
    if (corridor.speedKmh < current.speed) {
      current.speed = corridor.speedKmh
      current.coordinates = midpoint(corridor.coordinates)
    }
  }
  const jams = [...roads.values()].filter((road) => road.band === "jam" && road.lengthKm >= 0.05)
  jams.sort((a, b) => a.speed - b.speed || b.lengthKm - a.lengthKm)
  const slow = [...roads.values()].filter((road) => road.band === "slow" && road.lengthKm >= 0.05)
  slow.sort((a, b) => a.speed - b.speed || b.lengthKm - a.lengthKm)
  return [
    ...jams.slice(0, jamLimit).map((road) => ({
      id: `jam-${road.title}`,
      kind: "jam" as const,
      score: 400_000 + (30 - road.speed) * 1_000 + road.lengthKm * 10,
      urgent: true,
      label: m.bad,
      title: road.title,
      detail: `${m.speedKmh(Math.round(road.speed))} · ${m.lengthKm(road.lengthKm)}`,
      tone: "red" as const,
      coordinates: road.coordinates,
    })),
    ...slow.slice(0, slowLimit).map((road) => ({
      id: `slow-${road.title}`,
      kind: "slow" as const,
      score: 50_000 + (50 - road.speed) * 100,
      urgent: false,
      label: m.average,
      title: road.title,
      detail: `${m.speedKmh(Math.round(road.speed))} · ${m.lengthKm(road.lengthKm)}`,
      tone: "amber" as const,
      coordinates: road.coordinates,
    })),
  ]
}

function worksOf(collection: GeoJSON.FeatureCollection | null, limit: number, m: Messages): IntelItem[] {
  if (!collection) return []
  const rows = collection.features.flatMap((feature) => {
    const status = textProp(feature.properties, "status")
    const live = /in progress/i.test(status)
    const preparing = /preparation/i.test(status)
    if (!live && !preparing) return []
    const road = displayText(m.locale, textProp(feature.properties, "roadTc"), textProp(feature.properties, "road")) || m.roadWork
    const place = displayText(m.locale, textProp(feature.properties, "placeTc"), textProp(feature.properties, "place"))
    return [
      {
        id: `works-${textProp(feature.properties, "id") || road}`,
        kind: "works" as const,
        score: live ? 250_000 : 120_000,
        urgent: live,
        label: m.works,
        title: road,
        detail: [live ? m.worksLive : m.worksPrep, place].filter(Boolean).join(" · "),
        tone: (live ? "red" : "amber") as IntelTone,
        coordinates: pointOf(feature),
      },
    ]
  })
  rows.sort(byScore)
  return rows.slice(0, limit)
}

function warningsOf(warnings: WeatherWarning[], m: Messages): IntelItem[] {
  return warnings.map((warning) => ({
    id: warning.id,
    kind: "weather" as const,
    score: warning.score,
    urgent: warning.urgent,
    label: m.weather,
    title: warning.name,
    detail: warning.detail,
    tone: warning.tone,
    coordinates: null,
  }))
}

function weatherOf(input: IntelInput, warnings: IntelItem[], m: Messages): IntelItem[] {
  if (!input.warningsReady && !input.conditions) return []
  const items: IntelItem[] = []
  if (input.warningsError) {
    items.push(fault("fault-weather", 160_000, m.faultWeather, input.warningsError, m))
  }
  items.push(...warnings)
  const conditions = conditionsItem(input.conditions, m)
  if (conditions) items.push(conditions)
  return items
}

function conditionsItem(conditions: WeatherConditions | null, m: Messages): IntelItem | null {
  if (!conditions) return null
  const temperature = conditions.temperatureC
  const rainfall = conditions.rainfallMm
  if (temperature == null && rainfall == null) return null
  const hot = temperature != null && temperature >= 33
  const wet = rainfall != null && rainfall >= 10
  const rainDetail = rainfall == null ? "" : rainfall <= 0 ? m.noRain : m.rainHour(conditions.rainfallPlace, rainfall)
  return {
    id: "weather-conditions",
    kind: "weather",
    score: 1,
    urgent: wet && rainfall != null && rainfall >= 30,
    label: m.conditions,
    title: temperature == null ? m.noRain : m.observatoryTemp(Math.round(temperature)),
    detail: rainDetail,
    tone: rainfall != null && rainfall >= 30 ? "red" : wet || hot ? "amber" : "green",
    coordinates: null,
  }
}

function byScore(a: IntelItem, b: IntelItem): number {
  return b.score - a.score || a.title.localeCompare(b.title)
}

function midpoint(coordinates: [number, number][]): [number, number] | null {
  const point = coordinates[Math.floor(coordinates.length / 2)]
  return point ?? null
}

function pointOf(feature: GeoJSON.Feature): [number, number] | null {
  const geometry = feature.geometry
  if (!geometry || geometry.type !== "Point") return null
  const [lng, lat] = geometry.coordinates
  if (typeof lng !== "number" || typeof lat !== "number") return null
  return [lng, lat]
}

function textProp(properties: GeoJSON.GeoJsonProperties, key: string): string {
  if (!properties) return ""
  const value = properties[key]
  return typeof value === "string" ? value.trim() : ""
}

function numberProp(properties: GeoJSON.GeoJsonProperties, key: string): number | null {
  if (!properties) return null
  const value = properties[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function clip(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit - 1).trimEnd()}…`
}
