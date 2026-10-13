"use client"

import {
  Map,
  type ExpressionSpecification,
  type FilterSpecification,
} from "maplibre-gl"
import { readablePlace } from "@/components/map-cards"
import { directedRouteMarks, stopPlate, stopPlateKey, type StopPlate } from "@/lib/stop-plate"
import { labelsAboveMap } from "@/lib/label-stack"
import { BUILDINGS_PARK_METER_ZOOM, SOLO_PIN_ZOOM, placePinZoom } from "@/lib/kmb-view"
import { meterColorStops, meterInk, meterPin, meterPlateCount, type MeterPole } from "@/lib/meter-poles"
import { type ChargerPlace } from "@/lib/ev-chargers"
import { motorcyclePlateDrop, motorcycleShift } from "@/lib/parking-parks"
import { displayText, MESSAGES, type Locale } from "@/lib/i18n"
import { MAP_CREDIT } from "@/lib/map-credits"
import { mtrStationCollection, mtrTrackCollection, stationRecord } from "@/lib/mtr-network"
import { lrtStation, lrtStationCollection, lrtTrackCollection } from "@/lib/lrt-network"
import { ferryPierFeatures } from "@/lib/ferry-network"
import { SUN_ROUTES, ferryBadge } from "@/lib/ferry-routes"
import type { CitybusResponse, FerryResponse, KmbResponse, WatchLayer } from "@/lib/types"

export const LABEL_MIN_ZOOM = 16.5
export const COUNT_MIN_ZOOM = 13
export const VEHICLE_LABEL_MIN_ZOOM = 14.25

let plateFamily = ""
const plateHeights = new globalThis.Map<string, number>()

export function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] }
}

function stopPlateIconId(plate: StopPlate, stroke: string): string {
  return `stop-plate-${stroke.slice(1)}-${encodeURIComponent(stopPlateKey(plate))}`
}

export function placeStopPlate(map: Map, name: string, routes: string[], stroke: string, options?: { perLine?: number; keepOrder?: boolean; count?: { value: string; unit: string } }): string {
  const plate = stopPlate(name, routes, options)
  if (options?.count) plate.count = options.count
  if (!plate.title && plate.lines.length === 0 && !plate.count) return ""
  const icon = stopPlateIconId(plate, stroke)
  ensureStopPlate(map, icon, plate, stroke)
  return map.hasImage(icon) ? icon : ""
}

export function busPlate(map: Map, locale: Locale, name: string, routes: string[], calls: { route: string; destTc: string; destEn: string }[], stroke: string): string {
  const towards = MESSAGES[locale].towards
  const { marks, directed } = directedRouteMarks(routes, calls.map((call) => {
    const place = readablePlace(displayText(locale, call.destTc, call.destEn))
    return { route: call.route, dest: place ? towards(place) : "" }
  }))
  return placeStopPlate(map, name, marks, stroke, directed ? { perLine: 1, keepOrder: true } : undefined)
}

export function withTrainMarks(
  map: Map,
  collection: GeoJSON.FeatureCollection,
  locale: Locale,
  mode: "mtr" | "lrt",
): GeoJSON.FeatureCollection {
  for (const feature of collection.features) {
    const properties = feature.properties
    if (!properties) continue
    const dest = typeof properties.dest === "string" ? properties.dest : ""
    const record = mode === "mtr" ? stationRecord(dest) : lrtStation(dest)
    const name = record ? readablePlace(displayText(locale, record.tc, record.en)) : dest
    const route = mode === "lrt" && typeof properties.line === "string" ? properties.line : ""
    const stroke = typeof properties.color === "string" && properties.color ? properties.color : "#f7fbff"
    const heading = name ? MESSAGES[locale].towards(name) : ""
    const icon = placeStopPlate(map, heading, route ? [route] : [], stroke)
    if (icon) properties.icon = icon
  }
  return collection
}

export function withFerryMarks(map: Map, collection: GeoJSON.FeatureCollection, locale: Locale): GeoJSON.FeatureCollection {
  const copy = MESSAGES[locale]
  for (const feature of collection.features) {
    const properties = feature.properties
    if (!properties || typeof properties.board !== "string") continue
    let call: { route?: unknown; destTc?: unknown; destEn?: unknown } | null = null
    try {
      const parsed: unknown = JSON.parse(properties.board)
      call = Array.isArray(parsed) ? parsed[0] ?? null : null
    } catch {
      call = null
    }
    if (!call) continue
    const route = typeof call.route === "string" ? call.route : ""
    const known = SUN_ROUTES.find((item) => item.code === route)
    const destTc = typeof call.destTc === "string" && call.destTc ? call.destTc : known?.destTc ?? ""
    const destEn = typeof call.destEn === "string" && call.destEn ? call.destEn : known?.destEn ?? ""
    const place = readablePlace(displayText(locale, destTc, destEn))
    if (!place) continue
    const badge = ferryBadge(route)
    const service = displayText(locale, badge.tc, badge.en)
    const icon = placeStopPlate(map, copy.towards(place), service ? [service] : [], "#0369a1")
    if (icon) properties.icon = icon
  }
  return collection
}

function ensureStopPlate(map: Map, id: string, plate: StopPlate, stroke: string) {
  if (map.hasImage(id)) return
  const image = stopPlateImage(plate, stroke)
  if (!image) return
  map.addImage(id, image, { pixelRatio: 2 })
  plateHeights.set(id, image.height / 2)
}

function plateCssHeight(id: string): number {
  return plateHeights.get(id) ?? 0
}

function countChip(count: { value: string; unit: string }, stroke: string, family: string, scale: number): ImageData | null {
  const probe = document.createElement("canvas").getContext("2d")
  if (!probe) return null
  const countFont = `600 ${13 * scale}px ${family}`
  const unitFont = `500 ${8 * scale}px ${family}`
  probe.font = countFont
  const valueWidth = Math.ceil(probe.measureText(count.value).width)
  probe.font = unitFont
  const unitWidth = Math.ceil(probe.measureText(count.unit).width)
  const width = Math.max(valueWidth, unitWidth) + 12 * scale
  const height = 26 * scale
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, width)
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.beginPath()
  context.roundRect(scale, scale, canvas.width - scale * 2, canvas.height - scale * 2, 5 * scale)
  context.fillStyle = stroke
  context.fill()
  context.textAlign = "center"
  context.textBaseline = "middle"
  const center = canvas.width / 2
  context.font = countFont
  context.fillStyle = "#fff8e8"
  context.fillText(count.value, center, 10 * scale)
  context.font = unitFont
  context.fillStyle = "rgba(255, 248, 232, 0.86)"
  context.fillText(count.unit, center, 19 * scale)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function stopPlateImage(plate: StopPlate, stroke: string): ImageData | null {
  const scale = 2
  plateFamily ||= getComputedStyle(document.body).fontFamily || "sans-serif"
  const family = plateFamily
  const titleFont = `600 ${11 * scale}px ${family}`
  const routeFont = `600 ${10 * scale}px ${family}`
  const probe = document.createElement("canvas").getContext("2d")
  if (!probe) return null
  const rows = plate.title ? [plate.title, ...plate.lines] : plate.lines
  const count = plate.count
  if (rows.length === 0 && !count) return null
  if (count && rows.length === 0) return countChip(count, stroke, family, scale)
  const widths = rows.map((row, index) => {
    probe.font = index === 0 && plate.title ? titleFont : routeFont
    return Math.ceil(probe.measureText(row).width)
  })
  const padX = 6 * scale
  const padY = 4 * scale
  const lineHeight = 13 * scale
  if (!count) {
    const width = Math.max(1, Math.max(...widths) + padX * 2)
    const height = Math.max(1, rows.length * lineHeight + padY * 2)
    return paintPlate(width, height, scale, stroke, (context) => {
      context.textAlign = "left"
      context.textBaseline = "middle"
      rows.forEach((row, index) => {
        const titleRow = index === 0 && plate.title
        context.font = titleRow ? titleFont : routeFont
        context.fillStyle = titleRow ? "#fff8e8" : "#ffedd5"
        context.fillText(row, padX, padY + lineHeight * index + lineHeight / 2)
      })
    })
  }
  const countFont = `600 ${15 * scale}px ${family}`
  const unitFont = `500 ${8 * scale}px ${family}`
  probe.font = countFont
  const valueWidth = Math.ceil(probe.measureText(count.value).width)
  probe.font = unitFont
  const unitWidth = Math.ceil(probe.measureText(count.unit).width)
  const chipPadX = 7 * scale
  const chipWidth = Math.max(valueWidth, unitWidth) + chipPadX * 2
  const chipHeight = 28 * scale
  const textHeight = Math.max(lineHeight, rows.length * lineHeight)
  const width = Math.max(1, padX + Math.max(0, ...widths) + 8 * scale + chipWidth + padX)
  const height = Math.max(chipHeight + padY * 2, textHeight + padY * 2)
  return paintPlate(width, height, scale, stroke, (context) => {
    context.textAlign = "left"
    context.textBaseline = "middle"
    rows.forEach((row, index) => {
      const titleRow = index === 0 && plate.title
      const block = rows.length * lineHeight
      const top = (height - block) / 2
      context.font = titleRow ? titleFont : routeFont
      context.fillStyle = titleRow ? "#fff8e8" : "#ffedd5"
      context.fillText(row, padX, top + lineHeight * index + lineHeight / 2)
    })
    const chipX = width - padX - chipWidth
    const chipY = (height - chipHeight) / 2
    context.beginPath()
    context.roundRect(chipX, chipY, chipWidth, chipHeight, 4 * scale)
    context.fillStyle = stroke
    context.fill()
    context.textAlign = "center"
    const center = chipX + chipWidth / 2
    context.font = countFont
    context.fillStyle = "#fff8e8"
    context.fillText(count.value, center, chipY + 11 * scale)
    context.font = unitFont
    context.fillStyle = "rgba(255, 248, 232, 0.86)"
    context.fillText(count.unit, center, chipY + 22 * scale)
  })
}

function paintPlate(width: number, height: number, scale: number, stroke: string, paint: (context: CanvasRenderingContext2D) => void): ImageData | null {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null
  context.clearRect(0, 0, width, height)
  context.beginPath()
  context.roundRect(scale, scale, width - scale * 2, height - scale * 2, 6 * scale)
  context.fillStyle = "rgba(4, 16, 24, 0.92)"
  context.fill()
  context.lineWidth = scale
  context.strokeStyle = stroke
  context.stroke()
  paint(context)
  return context.getImageData(0, 0, width, height)
}


function overlaySlot(map: Map): string | undefined {
  // Circles and lines sit under the map's own place names. Stop names and the
  // moving trains are raised after the layers exist.
  const layers = map.getStyle()?.layers
  if (!layers) return undefined
  return layers.find((layer) => layer.type === "symbol")?.id
}

function raiseAboveMap(map: Map) {
  for (const id of labelsAboveMap) {
    if (map.getLayer(id)) map.moveLayer(id)
  }
}

function addOverlay(map: Map, layer: Parameters<Map["addLayer"]>[0], before: string | undefined) {
  if (before && map.getLayer(before)) map.addLayer(layer, before)
  else map.addLayer(layer)
}

function addCreditHold(map: Map, id: string, source: string, before: string | undefined) {
  addOverlay(map, {
    id,
    type: "circle",
    source,
    filter: ["==", ["literal", 1], 0],
    paint: { "circle-radius": 0 },
  }, before)
}

function addStopLabel(map: Map, id: string, source: string, before: string | undefined, minzoom = LABEL_MIN_ZOOM, allowOverlap = true, sortKey?: string, share = false, iconOffset: [number, number] | ExpressionSpecification = [0, -10]) {
  addOverlay(map, {
    id,
    type: "symbol",
    source,
    minzoom,
    filter: ["has", "icon"],
    layout: {
      "icon-image": ["get", "icon"],
      "icon-anchor": "bottom",
      "icon-offset": iconOffset,
      // A Citybus plate is placed first. Without this, it removes the KMB plate underneath once names appear.
      "icon-overlap": allowOverlap ? "always" : share ? "cooperative" : "never",
      "icon-ignore-placement": allowOverlap,
      ...(sortKey ? { "symbol-sort-key": ["get", sortKey] } : {}),
      "icon-pitch-alignment": "viewport",
      "icon-rotation-alignment": "viewport",
    },
  }, before)
}

export function mountDataLayers(map: Map) {
  map.addSource("cameras", { type: "geojson", data: emptyCollection() })
  map.addSource("speed-cams", { type: "geojson", data: emptyCollection() })
  map.addSource("works", { type: "geojson", data: emptyCollection() })
  map.addSource("tolls", { type: "geojson", data: emptyCollection() })
  map.addSource("incidents", { type: "geojson", data: emptyCollection() })
  map.addSource("control-points", {
    type: "geojson",
    data: emptyCollection(),
    attribution: MAP_CREDIT.immigration,
  })
  map.addSource("mtr-track", {
    type: "geojson",
    data: mtrTrackCollection(),
    attribution: MAP_CREDIT.osm,
  })
  map.addSource("mtr-stations", { type: "geojson", data: mtrStationCollection(), attribution: MAP_CREDIT.lands })
  map.addSource("mtr-trains", { type: "geojson", data: emptyCollection(), attribution: MAP_CREDIT.mtr })
  map.addSource("kmb-stops", { type: "geojson", data: emptyCollection(), attribution: MAP_CREDIT.kmb })
  map.addSource("lrt-track", {
    type: "geojson",
    data: lrtTrackCollection(),
    attribution: MAP_CREDIT.osm,
  })
  map.addSource("lrt-stations", { type: "geojson", data: lrtStationCollection(), attribution: MAP_CREDIT.mtr })
  map.addSource("lrt-trains", { type: "geojson", data: emptyCollection() })
  map.addSource("citybus-stops", { type: "geojson", data: emptyCollection(), attribution: MAP_CREDIT.citybus })
  map.addSource("gmb-stops", { type: "geojson", data: emptyCollection() })
  map.addSource("nlb-stops", { type: "geojson", data: emptyCollection(), attribution: MAP_CREDIT.nlb })
  map.addSource("mtrbus-stops", { type: "geojson", data: emptyCollection(), attribution: MAP_CREDIT.mtr })
  map.addSource("ferry-piers", { type: "geojson", data: emptyCollection(), attribution: MAP_CREDIT.ferries })
  map.addSource("ferry-vessels", { type: "geojson", data: emptyCollection() })
  map.addSource("parking", { type: "geojson", data: emptyCollection(), attribution: MAP_CREDIT.transport })
  map.addSource("motorcycle", { type: "geojson", data: emptyCollection(), attribution: MAP_CREDIT.transport })
  map.addSource("kerb", { type: "geojson", data: emptyCollection(), attribution: MAP_CREDIT.transport })
  map.addSource("meters", { type: "geojson", data: emptyCollection(), attribution: MAP_CREDIT.transport })
  map.addSource("chargers", {
    type: "geojson",
    data: emptyCollection(),
    attribution: MAP_CREDIT.environment,
  })
  map.addSource("approaches", { type: "geojson", data: emptyCollection() })
  map.addSource("corridors", {
    type: "geojson",
    data: emptyCollection(),
    attribution: MAP_CREDIT.transport,
  })
  map.addSource("particles", { type: "geojson", data: emptyCollection() })
  const before = overlaySlot(map)
  addOverlay(map, {
    id: "corridor-glow",
    type: "line",
    source: "corridors",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 7, 13, 12, 15, 16],
      "line-opacity": 0.32,
      "line-blur": 4,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before)
  addOverlay(map, {
    id: "corridor-casing",
    type: "line",
    source: "corridors",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: {
      "line-color": "#041018",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 13, 4.6, 15, 6.5],
      "line-opacity": 0.45,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before)
  addOverlay(map, {
    id: "corridor-line",
    type: "line",
    source: "corridors",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 13, 2.4, 15, 3.4],
      "line-opacity": 0.95,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before)
  addOverlay(map, {
    id: "corridor-point",
    type: "circle",
    source: "corridors",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 13, 5.5],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#f7fbff",
      "circle-stroke-width": 1,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addOverlay(map, {
    id: "traffic-particles",
    type: "circle",
    source: "particles",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.2, 13, 3.6],
      "circle-color": "#f4fff8",
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 1.6,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addWatchLayers(map, before)
}


function addWatchLayers(map: Map, before: string | undefined) {
  const cone = cameraCone()
  if (cone && !map.hasImage("camera-cone")) {
    map.addImage("camera-cone", cone, { pixelRatio: 2 })
  }
  addOverlay(map, {
    id: "tolls-overview",
    type: "circle",
    source: "tolls",
    maxzoom: 12.4,
    filter: ["==", ["get", "band"], "overview"],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 6, 15, 11],
      "circle-color": "rgba(125, 211, 232, 0.18)",
      "circle-stroke-color": "#E7FBFF",
      "circle-stroke-width": 2,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addOverlay(map, {
    id: "tolls-portal",
    type: "circle",
    source: "tolls",
    minzoom: 12.4,
    filter: ["==", ["get", "band"], "portal"],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 6, 15, 11],
      "circle-color": "rgba(125, 211, 232, 0.18)",
      "circle-stroke-color": "#E7FBFF",
      "circle-stroke-width": 2,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addOverlay(map, {
    id: "control-points-ring",
    type: "circle",
    source: "control-points",
    filter: ["==", ["get", "worst"], 2],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 14, 14, 22],
      "circle-color": "rgba(255, 93, 115, 0.18)",
      "circle-stroke-color": "#FF5D73",
      "circle-stroke-width": 1,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addOverlay(map, {
    id: "control-points",
    type: "circle",
    source: "control-points",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 6, 14, 9],
      "circle-color": [
        "match",
        ["get", "worst"],
        0,
        "#3DDC97",
        1,
        "#FFC857",
        2,
        "#FF5D73",
        99,
        "#5C6B7A",
        "#C9D2DC",
      ],
      "circle-stroke-color": "#041018",
      "circle-stroke-width": 2,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addOverlay(map, {
    id: "works",
    type: "circle",
    source: "works",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 6, 14, 9],
      "circle-color": ["match", ["get", "status"], "In Progress", "#FF5D73", "Under Preparation", "#FFC857", "#C9D2DC"],
      "circle-stroke-color": "#041018",
      "circle-stroke-width": 2,
      "circle-pitch-alignment": "map",
    },
  }, before)
  const mark = incidentMark()
  if (mark && !map.hasImage("incident-mark")) {
    map.addImage("incident-mark", mark, { pixelRatio: 2 })
  }
  if (map.hasImage("incident-mark")) {
    addOverlay(map, {
      id: "incidents",
      type: "symbol",
      source: "incidents",
      layout: {
        "icon-image": "incident-mark",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.72, 14, 1.05],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-pitch-alignment": "map",
        "icon-rotation-alignment": "map",
      },
    }, before)
  }
  if (map.hasImage("camera-cone")) {
    addCameraLayer(map, "cameras-harbour", ["==", ["get", "harbour"], 1], placePinZoom("cameras", null), before)
    addCameraLayer(map, "cameras-portal", ["all", ["==", ["get", "portal"], 1], ["!=", ["get", "harbour"], 1]], placePinZoom("cameras", null), before)
    addCameraLayer(map, "cameras-city", ["all", ["!=", ["get", "harbour"], 1], ["!=", ["get", "portal"], 1]], placePinZoom("cameras", null), before)
  }
  const housing = speedCamMark()
  if (housing && !map.hasImage("speed-cam-mark")) {
    map.addImage("speed-cam-mark", housing, { pixelRatio: 2 })
  }
  if (map.hasImage("speed-cam-mark")) {
    addOverlay(map, {
      id: "speed-cams",
      type: "symbol",
      source: "speed-cams",
      minzoom: placePinZoom("speedcam", null),
      layout: {
        "icon-image": "speed-cam-mark",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.55, 14, 0.9, 16, 1.05],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-pitch-alignment": "map",
        "icon-rotation-alignment": "map",
      },
    }, before)
  }
  addOverlay(map, {
    id: "mtr-track-casing",
    type: "line",
    source: "mtr-track",
    paint: {
      "line-color": "#041018",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 14, 5],
      "line-opacity": 0.55,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before)
  addOverlay(map, {
    id: "mtr-track",
    type: "line",
    source: "mtr-track",
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.6, 14, 2.6],
      "line-opacity": 0.92,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before)
  addOverlay(map, {
    id: "mtr-stations",
    type: "circle",
    source: "mtr-stations",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 14, 5.5],
      "circle-color": "#f7fbff",
      "circle-stroke-color": "#041018",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "mtr-station-label", "mtr-stations", before)
  addOverlay(map, {
    id: "mtr-trains",
    type: "circle",
    source: "mtr-trains",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4.5, 14, 7],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#f7fbff",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "mtr-train-label", "mtr-trains", before, VEHICLE_LABEL_MIN_ZOOM)
  addOverlay(map, {
    id: "kmb-stops",
    type: "circle",
    source: "kmb-stops",
    minzoom: BUILDINGS_PARK_METER_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 13, 3.5, 16, 6],
      "circle-color": "#f7fbff",
      "circle-stroke-color": "#9f1239",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "kmb-stop-label", "kmb-stops", before, LABEL_MIN_ZOOM, false, undefined, true)
  addCreditHold(map, "kmb-credit", "kmb-stops", before)
  addOverlay(map, {
    id: "motorcycle",
    type: "circle",
    source: "motorcycle",
    minzoom: BUILDINGS_PARK_METER_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 13, 3.5, 16, 6],
      "circle-color": "#f5f3ff",
      "circle-stroke-color": "#7c3aed",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "motorcycle-label", "motorcycle", before, BUILDINGS_PARK_METER_ZOOM, true, "free", false, [
    "case",
    ["has", "shift"],
    ["get", "shift"],
    ["literal", [0, -10]],
  ])
  addOverlay(map, {
    id: "parking",
    type: "circle",
    source: "parking",
    minzoom: BUILDINGS_PARK_METER_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 13, 3.5, 16, 6],
      "circle-color": "#fff7ed",
      "circle-stroke-color": "#d97706",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "parking-label", "parking", before, BUILDINGS_PARK_METER_ZOOM, true, "free")
  addOverlay(map, {
    id: "kerb",
    type: "circle",
    source: "kerb",
    minzoom: BUILDINGS_PARK_METER_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 13, 3.5, 16, 6],
      "circle-color": "#fdf2f8",
      "circle-stroke-color": "#be185d",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "kerb-label", "kerb", before, LABEL_MIN_ZOOM, false)
  addOverlay(map, {
    id: "meters",
    type: "circle",
    source: "meters",
    minzoom: BUILDINGS_PARK_METER_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 13, 3.5, 16, 6],
      "circle-color": meterColor("fill"),
      "circle-stroke-color": meterColor("stroke"),
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "meters-label", "meters", before, BUILDINGS_PARK_METER_ZOOM, true, "free")
  addOverlay(map, {
    id: "chargers",
    type: "circle",
    source: "chargers",
    minzoom: SOLO_PIN_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 13, 3.5, 16, 6],
      "circle-color": "#ecfeff",
      "circle-stroke-color": "#0e7490",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "chargers-label", "chargers", before, COUNT_MIN_ZOOM, true, "free")
  addOverlay(map, {
    id: "lrt-track-casing",
    type: "line",
    source: "lrt-track",
    paint: {
      "line-color": "#041018",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 14, 5],
      "line-opacity": 0.55,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before)
  addOverlay(map, {
    id: "lrt-track",
    type: "line",
    source: "lrt-track",
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.6, 14, 2.6],
      "line-opacity": 0.92,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before)
  addOverlay(map, {
    id: "lrt-stations",
    type: "circle",
    source: "lrt-stations",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 15, 5.5],
      "circle-color": "#fff8dc",
      "circle-stroke-color": "#8a6a00",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "lrt-station-label", "lrt-stations", before)
  addOverlay(map, {
    id: "lrt-trains",
    type: "circle",
    source: "lrt-trains",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 15, 6.5],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#1a1404",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "lrt-train-label", "lrt-trains", before, VEHICLE_LABEL_MIN_ZOOM)
  addOverlay(map, {
    id: "citybus-stops",
    type: "circle",
    source: "citybus-stops",
    minzoom: BUILDINGS_PARK_METER_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 13, 3.5, 16, 6],
      "circle-color": "#fff8e8",
      "circle-stroke-color": "#c2410c",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "citybus-stop-label", "citybus-stops", before, LABEL_MIN_ZOOM, false, undefined, true)
  addCreditHold(map, "citybus-credit", "citybus-stops", before)
  addOverlay(map, {
    id: "gmb-stops",
    type: "circle",
    source: "gmb-stops",
    minzoom: BUILDINGS_PARK_METER_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 13, 3.5, 16, 6],
      "circle-color": "#f7fee7",
      "circle-stroke-color": "#65a30d",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "gmb-stop-label", "gmb-stops", before, LABEL_MIN_ZOOM, false, undefined, true)
  addOverlay(map, {
    id: "nlb-stops",
    type: "circle",
    source: "nlb-stops",
    minzoom: BUILDINGS_PARK_METER_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 13, 3.5, 16, 6],
      "circle-color": "#f0fdfa",
      "circle-stroke-color": "#0f766e",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "nlb-stop-label", "nlb-stops", before, LABEL_MIN_ZOOM, false, undefined, true)
  addCreditHold(map, "nlb-credit", "nlb-stops", before)
  addOverlay(map, {
    id: "mtrbus-stops",
    type: "circle",
    source: "mtrbus-stops",
    minzoom: BUILDINGS_PARK_METER_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 13, 3.5, 16, 6],
      "circle-color": "#f0fdf4",
      "circle-stroke-color": "#166534",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "mtrbus-stop-label", "mtrbus-stops", before, LABEL_MIN_ZOOM, false, undefined, true)
  addOverlay(map, {
    id: "ferry-piers",
    type: "circle",
    source: "ferry-piers",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 7],
      "circle-color": "#e0f2fe",
      "circle-stroke-color": "#0369a1",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "ferry-pier-label", "ferry-piers", before)
  addOverlay(map, {
    id: "ferry-vessels",
    type: "circle",
    source: "ferry-vessels",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4.5, 15, 7.5],
      "circle-color": "#0369a1",
      "circle-stroke-color": "#f0f9ff",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "ferry-vessel-label", "ferry-vessels", before, VEHICLE_LABEL_MIN_ZOOM)
  raiseAboveMap(map)
  addOverlay(map, {
    id: "approach-times",
    type: "symbol",
    source: "approaches",
    layout: {
      "icon-image": ["get", "icon"],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-pitch-alignment": "map",
      "icon-rotation-alignment": "map",
    },
  }, before)
}

function incidentMark(): ImageData | null {
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null
  context.clearRect(0, 0, size, size)
  context.translate(size / 2, size / 2)
  context.beginPath()
  context.moveTo(0, -22)
  context.lineTo(18, 0)
  context.lineTo(0, 22)
  context.lineTo(-18, 0)
  context.closePath()
  context.fillStyle = "#FF5D73"
  context.fill()
  context.lineWidth = 4
  context.strokeStyle = "#FFF7F8"
  context.stroke()
  context.beginPath()
  context.moveTo(0, -8)
  context.lineTo(0, 4)
  context.lineWidth = 3
  context.strokeStyle = "#041018"
  context.stroke()
  context.beginPath()
  context.arc(0, 10, 1.8, 0, Math.PI * 2)
  context.fillStyle = "#041018"
  context.fill()
  return context.getImageData(0, 0, size, size)
}

function addCameraLayer(map: Map, id: string, filter: FilterSpecification, minzoom: number, beforeId: string | undefined) {
  addOverlay(map, {
    id,
    type: "symbol",
    source: "cameras",
    minzoom,
    filter,
    layout: {
      "icon-image": "camera-cone",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.42, 14, 0.85, 16, 1.05],
      "icon-rotate": ["get", "rotation"],
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  }, beforeId)
}

function speedCamMark(): ImageData | null {
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null
  context.clearRect(0, 0, size, size)
  context.translate(size / 2, size / 2)
  roundBox(context, -14, -10, 28, 22, 4)
  context.fillStyle = "#FFF7ED"
  context.fill()
  context.lineWidth = 3
  context.strokeStyle = "#7C2D12"
  context.stroke()
  context.beginPath()
  context.arc(0, 1, 7, 0, Math.PI * 2)
  context.fillStyle = "#FB923C"
  context.fill()
  context.beginPath()
  context.arc(-2, -1, 2, 0, Math.PI * 2)
  context.fillStyle = "#FFF7ED"
  context.fill()
  return context.getImageData(0, 0, size, size)
}

function cameraCone(): ImageData | null {
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null
  context.clearRect(0, 0, size, size)
  context.translate(size / 2, size / 2)
  context.lineJoin = "round"
  roundBox(context, -16, -6, 32, 24, 5)
  context.fillStyle = "#F4FEFF"
  context.fill()
  context.lineWidth = 2.5
  context.strokeStyle = "#083044"
  context.stroke()
  roundBox(context, -7, -12, 14, 8, 2)
  context.fillStyle = "#083044"
  context.fill()
  context.beginPath()
  context.arc(0, -18, 8, 0, Math.PI * 2)
  context.fillStyle = "#083044"
  context.fill()
  context.beginPath()
  context.arc(0, -18, 4.5, 0, Math.PI * 2)
  context.fillStyle = "#7DD3E8"
  context.fill()
  context.beginPath()
  context.arc(-1.5, -19.4, 1.5, 0, Math.PI * 2)
  context.fillStyle = "#F4FEFF"
  context.fill()
  return context.getImageData(0, 0, size, size)
}

function roundBox(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.arcTo(x + width, y, x + width, y + height, radius)
  context.arcTo(x + width, y + height, x, y + height, radius)
  context.arcTo(x, y + height, x, y, radius)
  context.arcTo(x, y, x + width, y, radius)
  context.closePath()
}

export function busStopCollection(map: Map, board: CitybusResponse, locale: Locale, labels: boolean, stroke: string): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: board.stops.map((stop) => {
      const name = readablePlace(displayText(locale, stop.nameTc, stop.nameEn))
      const icon = labels ? busPlate(map, locale, name, stop.routes, stop.calls, stroke) : ""
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [stop.lng, stop.lat] },
        properties: {
          id: stop.id,
          nameTc: stop.nameTc,
          nameEn: stop.nameEn,
          board: JSON.stringify(stop.calls),
          routes: JSON.stringify(stop.routes),
          clock: stop.clock,
          ...(icon ? { icon } : {}),
        },
      }
    }),
  }
}

export function ferryPierCollection(map: Map, ferry: FerryResponse | null, locale: Locale, labels: boolean): GeoJSON.FeatureCollection {
  const base = ferryPierFeatures(ferry)
  if (!labels) return base
  return {
    type: "FeatureCollection",
    features: base.features.map((feature) => {
      const properties = feature.properties ?? {}
      const traditional = typeof properties.nameTc === "string" ? properties.nameTc : ""
      const english = typeof properties.nameEn === "string" ? properties.nameEn : ""
      const board = typeof properties.board === "string" ? properties.board : "[]"
      let marks: string[] = []
      try {
        const parsed: unknown = JSON.parse(board)
        if (Array.isArray(parsed)) {
          const seen = new Set<string>()
          marks = parsed.flatMap((item) => {
            if (typeof item !== "object" || item === null) return []
            const row = item as { destTc?: unknown; destEn?: unknown; arriving?: unknown }
            if (row.arriving === true) return []
            const dest = displayText(locale, typeof row.destTc === "string" ? row.destTc : "", typeof row.destEn === "string" ? row.destEn : "")
            if (!dest || seen.has(dest)) return []
            seen.add(dest)
            return [dest]
          })
        }
      } catch {
        marks = []
      }
      const icon = placeStopPlate(map, readablePlace(displayText(locale, traditional, english)), marks, "#0369a1")
      return { ...feature, properties: { ...properties, ...(icon ? { icon } : {}) } }
    }),
  }
}

function hostedChargerPayload(chargers: readonly ChargerPlace[]): string {
  return JSON.stringify(chargers.map((charger) => ({
    nameTc: charger.nameTc,
    nameEn: charger.nameEn,
    standard: charger.standard,
    medium: charger.medium,
    quick: charger.quick,
    fast: charger.fast,
    free: charger.free,
  })))
}

export function parkingCollection(
  map: Map,
  parks: { id: string; nameTc: string; nameEn: string; addressTc: string; addressEn: string; lng: number; lat: number; heightM: number | null; cars: number | null }[],
  locale: Locale,
  labels: boolean,
  counts: boolean,
  hosted: ReadonlyMap<string, ChargerPlace[]>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: parks.map((park) => {
      const name = readablePlace(displayText(locale, park.nameTc, park.nameEn))
      const figure = park.cars == null ? undefined : { count: freeFigure(locale, park.cars) }
      const icon = labels
        ? placeStopPlate(map, name, [], "#d97706", figure)
        : counts && figure
          ? placeStopPlate(map, "", [], "#d97706", figure)
          : ""
      const group = hosted.get(park.id) ?? []
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [park.lng, park.lat] },
        properties: {
          id: park.id,
          nameTc: park.nameTc,
          nameEn: park.nameEn,
          addressTc: park.addressTc,
          addressEn: park.addressEn,
          heightM: park.heightM,
          cars: park.cars,
          free: park.cars ?? 0,
          ...(group.length > 0 ? { hostedChargers: hostedChargerPayload(group) } : {}),
          ...(icon ? { icon } : {}),
        },
      }
    }),
  }
}

export function motorcycleCollection(
  map: Map,
  parks: { id: string; nameTc: string; nameEn: string; addressTc: string; addressEn: string; lng: number; lat: number; heightM: number | null; motorcycle: number }[],
  locale: Locale,
  labels: boolean,
  counts: boolean,
  hosted: ReadonlyMap<string, ChargerPlace[]>,
  carIds: ReadonlySet<string>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: parks.map((park) => {
      const name = readablePlace(displayText(locale, park.nameTc, park.nameEn))
      const figure = { count: freeFigure(locale, park.motorcycle) }
      const icon = labels
        ? placeStopPlate(map, name, [], "#7c3aed", figure)
        : counts
          ? placeStopPlate(map, "", [], "#7c3aed", figure)
          : ""
      const shift = motorcycleShift(motorcyclePlateDrop(park.id, carIds) === 1, icon ? plateCssHeight(icon) : 0)
      const group = hosted.get(park.id) ?? []
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [park.lng, park.lat] },
        properties: {
          id: park.id,
          nameTc: park.nameTc,
          nameEn: park.nameEn,
          addressTc: park.addressTc,
          addressEn: park.addressEn,
          heightM: park.heightM,
          motorcycle: park.motorcycle,
          free: park.motorcycle,
          ...(shift ? { shift } : {}),
          ...(group.length > 0 ? { hostedChargers: hostedChargerPayload(group) } : {}),
          ...(icon ? { icon } : {}),
        },
      }
    }),
  }
}

export function kerbCollection(
  map: Map,
  rows: { id: string; streetTc: string; streetEn: string; lng: number; lat: number; bays: number }[],
  locale: Locale,
  labels: boolean,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((row) => {
      const name = readablePlace(displayText(locale, row.streetTc, row.streetEn))
      const icon = labels ? placeStopPlate(map, name, [String(row.bays)], "#be185d") : ""
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [row.lng, row.lat] },
        properties: {
          id: row.id,
          streetTc: row.streetTc,
          streetEn: row.streetEn,
          bays: row.bays,
          ...(icon ? { icon } : {}),
        },
      }
    }),
  }
}

export function meterCollection(map: Map, poles: MeterPole[], locale: Locale, _labels: boolean, counts: boolean): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: poles.map((pole) => {
      const pin = meterPin(pole)
      const count = meterPlateCount(pole)
      const figure = count == null ? undefined : { count: freeFigure(locale, Number(count)) }
      const icon = counts && figure ? placeStopPlate(map, "", [], pin.stroke, figure) : ""
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [pole.lng, pole.lat] },
        properties: {
          id: pole.id,
          streetTc: pole.streetTc,
          streetEn: pole.streetEn,
          sectionTc: pole.sectionTc,
          sectionEn: pole.sectionEn,
          mark: pin.mark,
          free: count == null ? 0 : Number(count),
          spaces: JSON.stringify(pole.spaces),
          ...(icon ? { icon } : {}),
        },
      }
    }),
  }
}

export function chargerCollection(
  map: Map,
  places: ChargerPlace[],
  locale: Locale,
  labels: boolean,
  counts: boolean,
  hosted: ReadonlyMap<string, ChargerPlace[]>,
): GeoJSON.FeatureCollection {
  const inside = new Set([...hosted.values()].flatMap((group) => group.map((place) => place.id)))
  return {
    type: "FeatureCollection",
    features: places.flatMap((place) => {
      if (inside.has(place.id)) return []
      const name = readablePlace(displayText(locale, place.nameTc, place.nameEn))
      const figure = place.free == null ? undefined : { count: freeFigure(locale, place.free) }
      const icon = labels
        ? placeStopPlate(map, name, [], "#0e7490", figure)
        : counts && figure
          ? placeStopPlate(map, "", [], "#0e7490", figure)
          : ""
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [place.lng, place.lat] },
        properties: {
          id: place.id,
          nameTc: place.nameTc,
          nameEn: place.nameEn,
          districtTc: place.districtTc,
          standard: place.standard,
          medium: place.medium,
          quick: place.quick,
          fast: place.fast,
          free: place.free ?? -1,
          ...(icon ? { icon } : {}),
        },
      }
    }),
  }
}

function freeFigure(locale: Locale, count: number): { value: string; unit: string } {
  return { value: String(count), unit: MESSAGES[locale].plateFree }
}

function meterColor(part: "fill" | "stroke"): ExpressionSpecification {
  const expression: unknown[] = ["match", ["get", "mark"]]
  for (const [mark, color] of meterColorStops(part)) expression.push(mark, color)
  expression.push(meterInk("private", "closed")[part])
  return expression as ExpressionSpecification
}

export function kmbStopCollection(map: Map, kmb: KmbResponse, locale: Locale, labels: boolean): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: kmb.stops.map((stop) => {
      const name = readablePlace(displayText(locale, stop.nameTc, stop.nameEn))
      const icon = labels ? busPlate(map, locale, name, stop.routes, stop.calls, "#9f1239") : ""
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [stop.lng, stop.lat] },
        properties: {
          id: stop.id,
          nameTc: stop.nameTc,
          nameEn: stop.nameEn,
          board: JSON.stringify(stop.calls),
          routes: JSON.stringify(stop.routes),
          clock: stop.clock,
          ...(icon ? { icon } : {}),
        },
      }
    }),
  }
}

export function platedStations(
  map: Map,
  collection: GeoJSON.FeatureCollection,
  locale: Locale,
  stroke: string,
  routesFor: (code: string) => string[],
  labels: boolean,
): GeoJSON.FeatureCollection {
  if (!labels) return collection
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => {
      const properties = feature.properties ?? {}
      const code = typeof properties.code === "string" ? properties.code : ""
      const traditional = typeof properties.nameTc === "string" ? properties.nameTc : ""
      const english = typeof properties.name === "string" ? properties.name : ""
      const icon = placeStopPlate(map, readablePlace(displayText(locale, traditional, english)), routesFor(code), stroke)
      return {
        ...feature,
        properties: { ...properties, ...(icon ? { icon } : {}) },
      }
    }),
  }
}

export function layerIds(kind: WatchLayer): string[] {
  switch (kind) {
    case "speed":
      return ["corridor-glow", "corridor-casing", "corridor-line", "corridor-point", "traffic-particles"]
    case "cameras":
      return ["cameras-harbour", "cameras-portal", "cameras-city"]
    case "speedcam":
      return ["speed-cams"]
    case "works":
      return ["works"]
    case "tolls":
      return ["tolls-portal", "tolls-overview"]
    case "incidents":
      return ["incidents"]
    case "control":
      return ["control-points", "control-points-ring"]
    case "mtr":
      return ["mtr-track-casing", "mtr-track", "mtr-stations", "mtr-station-label", "mtr-trains", "mtr-train-label"]
    case "kmb":
      return ["kmb-stops", "kmb-stop-label", "kmb-credit"]
    case "lrt":
      return ["lrt-track-casing", "lrt-track", "lrt-stations", "lrt-station-label", "lrt-trains", "lrt-train-label"]
    case "citybus":
      return ["citybus-stops", "citybus-stop-label", "citybus-credit"]
    case "gmb":
      return ["gmb-stops", "gmb-stop-label"]
    case "nlb":
      return ["nlb-stops", "nlb-stop-label", "nlb-credit"]
    case "mtrbus":
      return ["mtrbus-stops", "mtrbus-stop-label"]
    case "ferry":
      return ["ferry-piers", "ferry-pier-label", "ferry-vessels", "ferry-vessel-label"]
    case "parking":
      return ["parking", "parking-label"]
    case "motorcycle":
      return ["motorcycle", "motorcycle-label"]
    case "kerb":
      return ["kerb", "kerb-label"]
    case "meter":
      return ["meters", "meters-label"]
    case "charger":
      return ["chargers", "chargers-label"]
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

