"use client"

import { useEffect, useRef, useState, type MutableRefObject } from "react"
import {
  GeoJSONSource,
  GeolocateControl,
  GPUInitializationError,
  Map,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type ErrorEvent,
  type LngLat,
  type MapGeoJSONFeature,
  type MapMouseEvent,
  type StyleSpecification,
} from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { useI18n } from "@/components/locale"
import {
  approachPopup,
  kerbPopup,
  cameraPopup,
  controlPointPopup,
  kmbStopPopup,
  citybusStopPopup,
  ferryStopPopup,
  gmbStopPopup,
  lrtStationPopup,
  nlbStopPopup,
  mtrBusStopPopup,
  meterPopup,
  chargerPopup,
  parkingPopup,
  lrtTrainPopup,
  corridorPopup,
  incidentPopup,
  speedCamPopup,
  stationPopup,
  tollPopup,
  trainPopup,
  workPopup,
} from "@/components/map-cards"
import { BUILDINGS_FLYOVER_ZOOM, FLYOVER_END_ZOOM, focusZoom, mapViewKey, placePinZoom } from "@/lib/kmb-view"
import { type MeterPole } from "@/lib/meter-poles"
import { chargersInsideParks, type ChargerPlace } from "@/lib/ev-chargers"
import { carPinsWhenBoth, motorcyclePinsWhenBoth } from "@/lib/parking-parks"
import { favouriteFromHit, placesSnapshot, replacePlaces, subscribePlaces, togglePlace } from "@/lib/favourites"
import { paintPlaceStar, stampPlaceStar } from "@/lib/place-star"
import { soleLayer } from "@/lib/preferences"
import { displayText, type Messages } from "@/lib/i18n"
import { MAP_CREDIT } from "@/lib/map-credits"
import { lineRecord, mtrStationCollection, replaceMtrStationList, stationPoint, type MtrStationPin } from "@/lib/mtr-network"
import { lrtColor, lrtPoint, lrtRoutesThrough, lrtStationCollection } from "@/lib/lrt-network"
import { ferryMotionFeatures, syncFerryMotion, type FerryMotion } from "@/lib/ferry-run"
import { PUSH_GAP_MS, beginPush, endPush, motionGap, pushDue, type PushGate } from "@/lib/frame-push"
import { advanceRuns, mergeRuns, runCollection, runsFromTrains, type TrainRun } from "@/lib/mtr-run"
import type { ApproachPoint, Basemap, CitybusResponse, Corridor, FerryResponse, GmbResponse, HarbourJourney, KmbResponse, LrtResponse, MtrResponse, NlbResponse, PictureResponse, SpeedBand, WatchLayer, WatchLayers } from "@/lib/types"
import {
  busStopCollection,
  chargerCollection,
  COUNT_MIN_ZOOM,
  emptyCollection,
  ferryPierCollection,
  kerbCollection,
  kmbStopCollection,
  LABEL_MIN_ZOOM,
  layerIds,
  meterCollection,
  mountDataLayers,
  motorcycleCollection,
  parkingCollection,
  platedStations,
  VEHICLE_LABEL_MIN_ZOOM,
  withFerryMarks,
  withTrainMarks,
} from "@/components/map-draw"

// Turbopack rewrites MapLibre's own worker URL into a chunk the worker cannot run.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")

const BAND_COLOR: Record<SpeedBand, string> = {
  free: "#3DDC97",
  slow: "#FFC857",
  congested: "#FF5D73",
  unknown: "#C9D2DC",
}

const OPENING = {
  center: [114.175, 22.293] as [number, number],
  zoom: 12.55,
  pitch: 58,
  bearing: -20,
}

// Halfway between the city view and the close view. Stop names stay at the close view.

function narrowScreen(): boolean {
  return window.matchMedia("(max-width: 760px)").matches
}

function iosWebKit(): boolean {
  const agent = navigator.userAgent
  const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/.test(agent) || touchMac
}

function mapPixelRatio(): number {
  const ratio = window.devicePixelRatio || 1
  if (narrowScreen()) return Math.min(ratio, 2)
  return ratio
}

// OSM Bright and OSM Liberty. The files in those repositories call a keyed
// MapTiler endpoint. OpenFreeMap publishes the same styles against its planet
// tiles, which is the source this map already uses.
const STREET_STYLE = "https://tiles.openfreemap.org/styles/bright"
const BUILDINGS_STYLE = "https://tiles.openfreemap.org/styles/liberty"

function satelliteStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      imagery: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        // Esri's picture is 256 px. A 512 px tile stretches that picture and the
        // phone keeps the coarser zoom.
        tileSize: 256,
        // Hong Kong imagery is real through zoom 19. Zoom 20 and above is Esri's
        // gray "Map Data Not Yet Available" tile, so the map scales the zoom 19 picture.
        maxzoom: 19,
        attribution: MAP_CREDIT.esri,
      },
      labels: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
      },
    },
    layers: [
      { id: "satellite", type: "raster", source: "imagery", paint: { "raster-fade-duration": 0 } },
      { id: "places", type: "raster", source: "labels", paint: { "raster-fade-duration": 0, "raster-opacity": 0.88 } },
    ],
  }
}

function basemapStyle(basemap: Basemap): string | StyleSpecification {
  switch (basemap) {
    case "street":
      return STREET_STYLE
    case "buildings":
      return BUILDINGS_STYLE
    case "satellite":
      return satelliteStyle()
    default: {
      const exhaustive: never = basemap
      return exhaustive
    }
  }
}

function basemapCamera(map: Map, basemap: Basemap): { pitch: number; bearing: number; zoom?: number; duration: number } {
  const phone = narrowScreen()
  switch (basemap) {
    case "street":
      return { pitch: 0, bearing: 0, duration: phone ? 200 : 650 }
    case "satellite":
      return { pitch: OPENING.pitch, bearing: OPENING.bearing, duration: phone ? 200 : 650 }
    case "buildings":
      return {
        pitch: phone ? 46 : 64,
        bearing: -18,
        zoom: Math.max(map.getZoom(), phone ? 14.05 : 15.4),
        duration: phone ? 200 : 800,
      }
    default: {
      const exhaustive: never = basemap
      return exhaustive
    }
  }
}

function tourCamera(step: (typeof FLYOVER)[number], basemap: Basemap) {
  switch (basemap) {
    case "street":
      return { ...step, pitch: 0, bearing: 0 }
    case "satellite":
      return step
    case "buildings":
      return { ...step, zoom: Math.max(step.zoom, BUILDINGS_FLYOVER_ZOOM), pitch: Math.max(step.pitch, 60) }
    default: {
      const exhaustive: never = basemap
      return exhaustive
    }
  }
}

const FLYOVER = [
  { center: [114.148, 22.3] as [number, number], zoom: 12.7, pitch: 60, bearing: -8, duration: 7000, curve: 1.25 },
  { center: [114.21, 22.3] as [number, number], zoom: 12.55, pitch: 54, bearing: 18, duration: 7600, curve: 1.25 },
  { center: [114.178, 22.292] as [number, number], zoom: FLYOVER_END_ZOOM, pitch: 52, bearing: -12, duration: 7200, curve: 1.2 },
]

const WATCH_HITS = ["approach-times", "incidents", "cameras-harbour", "cameras-portal", "cameras-city", "speed-cams", "works", "tolls-portal", "tolls-overview", "control-points", "mtr-stations", "mtr-station-label", "mtr-trains", "mtr-train-label", "kmb-stops", "kmb-stop-label", "lrt-stations", "lrt-station-label", "lrt-trains", "lrt-train-label", "citybus-stops", "citybus-stop-label", "gmb-stops", "gmb-stop-label", "nlb-stops", "nlb-stop-label", "mtrbus-stops", "mtrbus-stop-label", "ferry-piers", "ferry-pier-label", "ferry-vessels", "ferry-vessel-label", "parking", "parking-label", "motorcycle", "motorcycle-label", "kerb", "kerb-label", "meters", "meters-label", "chargers", "chargers-label"]

type AnimLine = {
  coords: [number, number][]
  cum: number[]
  band: SpeedBand
  speed: number
}

type Particle = { line: number; t: number }

type CityMapProps = {
  corridors: Corridor[]
  approaches: ApproachPoint[]
  picture: PictureResponse | null
  speedCams: GeoJSON.FeatureCollection | null
  incidents: GeoJSON.FeatureCollection | null
  controlPoints: GeoJSON.FeatureCollection | null
  mtr: MtrResponse | null
  mtrStations: MtrStationPin[] | null
  kmb: KmbResponse | null
  lrt: LrtResponse | null
  citybus: CitybusResponse | null
  gmb: GmbResponse | null
  nlb: NlbResponse | null
  mtrBus: NlbResponse | null
  ferry: FerryResponse | null
  parking: { id: string; nameTc: string; nameEn: string; addressTc: string; addressEn: string; lng: number; lat: number; heightM: number | null; cars: number | null }[] | null
  motorcycles: { id: string; nameTc: string; nameEn: string; addressTc: string; addressEn: string; lng: number; lat: number; heightM: number | null; motorcycle: number }[] | null
  kerbs: { id: string; streetTc: string; streetEn: string; lng: number; lat: number; bays: number }[] | null
  meters: MeterPole[] | null
  chargers: ChargerPlace[] | null
  onView: (view: { lng: number; lat: number; zoom: number }) => void
  layers: WatchLayers
  basemap: Basemap
  flyToken: number
  focus: { id: string; coordinates: [number, number]; zoom?: number } | null
  onMap: (available: boolean) => void
  disabled?: boolean
}

const PILL: Record<HarbourJourney["colour"], string> = {
  red: "#FF5D73",
  amber: "#FFC857",
  green: "#3DDC97",
  none: "#C9D2DC",
}

export function CityMap({
  corridors,
  approaches,
  picture,
  speedCams,
  incidents,
  controlPoints,
  mtr,
  mtrStations,
  kmb,
  lrt,
  citybus,
  gmb,
  nlb,
  mtrBus,
  ferry,
  parking,
  motorcycles,
  kerbs,
  meters,
  chargers,
  onView,
  layers,
  basemap,
  flyToken,
  focus,
  onMap,
  disabled = false,
}: CityMapProps) {
  const { locale, messages } = useI18n()
  const copyRef = useRef(messages)
  const localeRef = useRef(locale)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const linesRef = useRef<AnimLine[]>([])
  const particlesRef = useRef<Particle[]>([])
  const corridorsRef = useRef(corridors)
  const mtrRef = useRef(mtr)
  const runsRef = useRef<TrainRun[]>([])
  const lrtRef = useRef(lrt)
  const lrtRunsRef = useRef<TrainRun[]>([])
  const ferryMotionRef = useRef<FerryMotion[]>([])
  const onMapRef = useRef(onMap)
  const onViewRef = useRef(onView)
  const readyRef = useRef(false)
  const basemapRef = useRef(basemap)
  const cancelFlyRef = useRef<(() => void) | null>(null)
  const closeCardRef = useRef<(() => void) | null>(null)
  const approachesRef = useRef(approaches)
  const viewKeyRef = useRef<string | null>(null)
  const appliedBasemap = useRef<Basemap | null>(null)
  const restoreOverlaysRef = useRef<(() => void) | null>(null)
  const styleToken = useRef(0)
  const [mapReady, setMapReady] = useState(false)
  const [styleEpoch, setStyleEpoch] = useState(0)
  const [gpuFailed, setGpuFailed] = useState(false)
  const [wasDisabled, setWasDisabled] = useState(disabled)
  if (disabled !== wasDisabled) {
    setWasDisabled(disabled)
    if (!disabled) setGpuFailed(false)
  }
  const unavailable = disabled || gpuFailed

  useEffect(() => {
    copyRef.current = messages
    localeRef.current = locale
    const button = containerRef.current?.querySelector<HTMLButtonElement>(".maplibregl-ctrl-geolocate")
    if (!button) return
    button.title = messages.locate
    button.setAttribute("aria-label", messages.locate)
  }, [locale, mapReady, messages])

  useEffect(() => {
    corridorsRef.current = corridors
    const map = mapRef.current
    if (!map || !readyRef.current) return
    publishCorridors(map, corridors, linesRef, particlesRef, copyRef.current)
  }, [corridors, locale, styleEpoch])

  useEffect(() => {
    onMapRef.current = onMap
  }, [onMap])

  useEffect(() => {
    onViewRef.current = onView
  }, [onView])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    let settle = 0
    const report = () => {
      window.clearTimeout(settle)
      settle = window.setTimeout(() => {
        const centre = map.getCenter()
        const zoom = map.getZoom()
        const key = mapViewKey(centre.lng, centre.lat, zoom)
        if (viewKeyRef.current === key) return
        viewKeyRef.current = key
        onViewRef.current({ lng: centre.lng, lat: centre.lat, zoom })
      }, 800)
    }
    report()
    map.on("moveend", report)
    return () => {
      window.clearTimeout(settle)
      map.off("moveend", report)
    }
  }, [disabled, mapReady])

  useEffect(() => {
    mtrRef.current = mtr
    if (!mtr?.ok) {
      runsRef.current = []
      return
    }
    const now = Date.now()
    runsRef.current = mergeRuns(
      runsRef.current,
      runsFromTrains(mtr.trains, stationPoint, (line) => lineRecord(line)?.color ?? "#5C6B7A", now),
      now,
      stationPoint,
    )
  }, [mtr])

  useEffect(() => {
    lrtRef.current = lrt
    if (!lrt?.ok) {
      lrtRunsRef.current = []
      return
    }
    const now = Date.now()
    lrtRunsRef.current = mergeRuns(
      lrtRunsRef.current,
      runsFromTrains(lrt.trains, lrtPoint, () => lrtColor(), now),
      now,
      lrtPoint,
    )
  }, [lrt])

  useEffect(() => {
    ferryMotionRef.current = ferry?.ok ? syncFerryMotion(ferryMotionRef.current, ferry.vessels, Date.now()) : []
  }, [ferry])

  useEffect(() => {
    basemapRef.current = basemap
  }, [basemap])

  useEffect(() => {
    onMapRef.current(!unavailable)
  }, [unavailable])

  useEffect(() => {
    if (disabled) return

    const container = containerRef.current
    if (!container) return

    let active = true
    let map: Map
    try {
      map = new Map({
        container,
        pixelRatio: mapPixelRatio(),
        attributionControl: { compact: true },
        maxPitch: 72,
        maxBounds: [
          [113.62, 21.98],
          [114.62, 22.72],
        ],
        style: satelliteStyle(),
        ...OPENING,
      })
    } catch (error) {
      if (!isGpuFailure(error)) throw error
      queueMicrotask(() => {
        if (active) setGpuFailed(true)
      })
      return () => {
        active = false
      }
    }
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-left")
    map.addControl(new GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: 8_000, maximumAge: 15_000 },
      trackUserLocation: false,
      showUserLocation: true,
      fitBoundsOptions: { maxZoom: 16 },
    }), "top-left")
    mapRef.current = map
    holdDataCreditOpen(map)

    let terrainFailed = false
    let removed = false
    const dropMap = () => {
      if (removed) return
      removed = true
      readyRef.current = false
      mapRef.current = null
      setMapReady(false)
      setGpuFailed(true)
      map.remove()
    }
    map.on("error", (event: ErrorEvent & { sourceId?: string }) => {
      if (isGpuFailure(event.error)) {
        dropMap()
        return
      }
      if (terrainFailed) return
      if (event.sourceId === "terrain") {
        terrainFailed = true
        map.setTerrain(null)
      }
    })

    const cards = popupOpener(map)
    closeCardRef.current = cards.close
    const restoreOverlays = () => {
      mountDataLayers(map)
      bindOverlayClicks(map, cards.show, copyRef, approachesRef, mtrRef, lrtRef)
      holdDataCreditOpen(map)
    }
    restoreOverlaysRef.current = restoreOverlays

    map.on("load", () => {
      map.resize()
      map.setTerrain(null)
      restoreOverlays()
      readyRef.current = true
      setMapReady(true)
      publishCorridors(map, corridorsRef.current, linesRef, particlesRef, copyRef.current)
    })

    let frame = 0
    let last = performance.now()
    let drewParticles = false
    // iOS Safari stops requestAnimationFrame on a WebGL page it considers idle,
    // and a GeoJSON push every frame aborts the tile reload before the dot moves.
    const ios = iosWebKit()
    const pushGap = motionGap(ios)
    const gates: Record<"particles" | "mtr" | "lrt" | "ferry", PushGate> = {
      particles: { busy: false, at: 0 },
      mtr: { busy: false, at: 0 },
      lrt: { busy: false, at: 0 },
      ferry: { busy: false, at: 0 },
    }
    let keep: HTMLDivElement | null = null
    if (ios) {
      keep = document.createElement("div")
      keep.setAttribute("aria-hidden", "true")
      keep.className = "ios-frame-keep"
      document.body.appendChild(keep)
    }
    const step = () => {
      const now = performance.now()
      const elapsed = Math.max(0, (now - last) / 1000)
      last = now
      const dt = Math.min(0.05, elapsed)
      const current = mapRef.current
      if (current && readyRef.current && !document.hidden) {
        const particles = geoJsonSource(current, "particles")
        const particlesMoving = layerShown(current, "traffic-particles") && linesRef.current.length > 0 && particlesRef.current.length > 0
        if (particles && particlesMoving) {
          advanceParticles(linesRef.current, particlesRef.current, dt)
          const moving = particleFeatures(linesRef.current, particlesRef.current)
          if (ios) {
            if (pushDue(gates.particles, now, pushGap)) pushMovingSource(particles, gates.particles, moving, now, pushGap)
          } else particles.setData(moving)
          drewParticles = true
        } else if (particles && drewParticles) {
          particles.setData(emptyCollection())
          drewParticles = false
        }
        if (layerShown(current, "control-points-ring")) {
          const pulse = 0.15 + 0.2 * (0.5 + 0.5 * Math.sin(now / 320))
          current.setPaintProperty("control-points-ring", "circle-opacity", pulse)
        }
        const trainStep = Math.min(1, elapsed)
        const showLabels = current.getZoom() >= VEHICLE_LABEL_MIN_ZOOM
        if (layerShown(current, "mtr-trains")) {
          runsRef.current = advanceRuns(runsRef.current, trainStep, stationPoint)
          if (!ios || pushDue(gates.mtr, now, pushGap)) {
            const moving = runCollection(runsRef.current, stationPoint)
            if (showLabels) withTrainMarks(current, moving, localeRef.current, "mtr")
            moveVehicles(current, "mtr-trains", gates.mtr, moving, ios, now, pushGap)
          }
        }
        if (layerShown(current, "lrt-trains")) {
          lrtRunsRef.current = advanceRuns(lrtRunsRef.current, trainStep, lrtPoint)
          if (!ios || pushDue(gates.lrt, now, pushGap)) {
            const moving = runCollection(lrtRunsRef.current, lrtPoint)
            if (showLabels) withTrainMarks(current, moving, localeRef.current, "lrt")
            moveVehicles(current, "lrt-trains", gates.lrt, moving, ios, now, pushGap)
          }
        }
        if (layerShown(current, "ferry-vessels")) {
          if (!ios || pushDue(gates.ferry, now, pushGap)) {
            const moving = ferryMotionFeatures(ferryMotionRef.current, Date.now())
            if (showLabels) withFerryMarks(current, moving, localeRef.current)
            moveVehicles(current, "ferry-vessels", gates.ferry, moving, ios, now, pushGap)
          }
        }
      }
    }
    const tick = () => {
      step()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const pulse = ios ? window.setInterval(step, PUSH_GAP_MS) : 0

    return () => {
      active = false
      cancelAnimationFrame(frame)
      if (pulse) window.clearInterval(pulse)
      keep?.remove()
      readyRef.current = false
      if (!removed) {
        removed = true
        map.remove()
      }
      mapRef.current = null
      restoreOverlaysRef.current = null
      closeCardRef.current = null
    }
  }, [disabled])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    let cancelled = false
    const cancel = () => {
      cancelled = true
    }
    cancelFlyRef.current = cancel
    const timeouts: number[] = []
    const start = window.setTimeout(() => {
      if (cancelled) return
      const automatic = flyToken === 0
      if (automatic && (narrowScreen() || window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return
      let index = 0
      const run = () => {
        if (cancelled || index >= FLYOVER.length) return
        const next = FLYOVER[index]
        index += 1
        if (!next) return
        map.flyTo({ ...tourCamera(next, basemapRef.current), essential: true })
        map.once("moveend", run)
      }
      run()
    }, 700)
    timeouts.push(start)
    return () => {
      cancel()
      if (cancelFlyRef.current === cancel) cancelFlyRef.current = null
      timeouts.forEach((id) => window.clearTimeout(id))
      if (mapRef.current === map) map.stop()
    }
  }, [disabled, flyToken, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!focus || disabled || !map || !mapReady) return
    cancelFlyRef.current?.()
    closeCardRef.current?.()
    map.stop()
    const floor = basemapRef.current === "buildings" && !narrowScreen() ? 15.6 : 14.2
    const requested = focus.zoom ?? floor
    map.flyTo({
      center: focus.coordinates,
      zoom: focusZoom(map.getZoom(), floor, requested),
      duration: narrowScreen() ? 250 : 900,
      essential: true,
    })
  }, [disabled, focus, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady) {
      appliedBasemap.current = null
      return
    }
    if (disabled || !map) return
    if (appliedBasemap.current === basemap) return
    const first = appliedBasemap.current === null
    appliedBasemap.current = basemap
    if (first && basemap === "satellite") return
    cancelFlyRef.current?.()
    readyRef.current = false
    const token = styleToken.current + 1
    styleToken.current = token
    map.setTerrain(null)
    map.setStyle(basemapStyle(basemap), { diff: false })
    map.once("style.load", () => {
      if (token !== styleToken.current || mapRef.current !== map) return
      map.setTerrain(null)
      restoreOverlaysRef.current?.()
      readyRef.current = true
      map.easeTo({ ...basemapCamera(map, basemap), essential: true })
      setStyleEpoch((epoch) => epoch + 1)
    })
  }, [basemap, disabled, mapReady])

  useEffect(() => {
    approachesRef.current = approaches
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const features: GeoJSON.Feature[] = approaches.flatMap((point) => {
      const minutes = shortestMinutes(point)
      if (minutes == null) return []
      const colour = worstColour(point)
      const label = messages.minutes(minutes)
      const icon = approachIconId(colour, label)
      ensureApproachIcon(map, icon, label, PILL[colour])
      return [
        {
          type: "Feature" as const,
          properties: { id: point.id, icon },
          geometry: { type: "Point" as const, coordinates: point.coordinates },
        },
      ]
    })
    geoJsonSource(map, "approaches")?.setData({ type: "FeatureCollection", features })
  }, [approaches, disabled, mapReady, locale, messages, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    geoJsonSource(map, "cameras")?.setData(picture?.cameras ?? emptyCollection())
    geoJsonSource(map, "works")?.setData(picture?.works ?? emptyCollection())
    geoJsonSource(map, "tolls")?.setData(picture?.tolls ?? emptyCollection())
  }, [disabled, mapReady, picture, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    geoJsonSource(map, "speed-cams")?.setData(speedCams ?? emptyCollection())
  }, [disabled, mapReady, speedCams, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    geoJsonSource(map, "incidents")?.setData(incidents ? incidentPoints(incidents) : emptyCollection())
  }, [disabled, incidents, mapReady, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    geoJsonSource(map, "control-points")?.setData(controlPoints ?? emptyCollection())
  }, [controlPoints, disabled, mapReady, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    if (!mtr?.ok) geoJsonSource(map, "mtr-trains")?.setData(emptyCollection())
  }, [disabled, mapReady, mtr, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    if (!layers.lrt) geoJsonSource(map, "lrt-trains")?.setData(emptyCollection())
  }, [disabled, layers.lrt, mapReady, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const paint = () => {
      const labels = map.getZoom() >= LABEL_MIN_ZOOM
      if (!layers.kmb) geoJsonSource(map, "kmb-stops")?.setData(emptyCollection())
      else if (kmb?.ok) geoJsonSource(map, "kmb-stops")?.setData(kmbStopCollection(map, kmb, locale, labels))
    }
    paint()
    map.on("zoomend", paint)
    return () => {
      map.off("zoomend", paint)
    }
  }, [disabled, kmb, layers.kmb, locale, mapReady, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const paint = () => {
      const labels = map.getZoom() >= LABEL_MIN_ZOOM
      if (!layers.citybus) geoJsonSource(map, "citybus-stops")?.setData(emptyCollection())
      else if (citybus?.ok) geoJsonSource(map, "citybus-stops")?.setData(busStopCollection(map, citybus, locale, labels, "#c2410c"))
    }
    paint()
    map.on("zoomend", paint)
    return () => {
      map.off("zoomend", paint)
    }
  }, [citybus, disabled, layers.citybus, locale, mapReady, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const paint = () => {
      const labels = map.getZoom() >= LABEL_MIN_ZOOM
      if (!layers.gmb) geoJsonSource(map, "gmb-stops")?.setData(emptyCollection())
      else if (gmb?.ok) geoJsonSource(map, "gmb-stops")?.setData(busStopCollection(map, gmb, locale, labels, "#65a30d"))
    }
    paint()
    map.on("zoomend", paint)
    return () => {
      map.off("zoomend", paint)
    }
  }, [disabled, gmb, layers.gmb, locale, mapReady, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const paint = () => {
      const labels = map.getZoom() >= LABEL_MIN_ZOOM
      if (!layers.nlb) geoJsonSource(map, "nlb-stops")?.setData(emptyCollection())
      else if (nlb?.ok) geoJsonSource(map, "nlb-stops")?.setData(busStopCollection(map, nlb, locale, labels, "#0f766e"))
    }
    paint()
    map.on("zoomend", paint)
    return () => {
      map.off("zoomend", paint)
    }
  }, [disabled, layers.nlb, locale, mapReady, nlb, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const paint = () => {
      const labels = map.getZoom() >= LABEL_MIN_ZOOM
      if (!layers.mtrbus) geoJsonSource(map, "mtrbus-stops")?.setData(emptyCollection())
      else if (mtrBus?.ok) geoJsonSource(map, "mtrbus-stops")?.setData(busStopCollection(map, mtrBus, locale, labels, "#166534"))
    }
    paint()
    map.on("zoomend", paint)
    return () => {
      map.off("zoomend", paint)
    }
  }, [disabled, layers.mtrbus, locale, mapReady, mtrBus, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const paint = () => {
      const labels = map.getZoom() >= LABEL_MIN_ZOOM
      if (!layers.ferry) {
        geoJsonSource(map, "ferry-piers")?.setData(emptyCollection())
        geoJsonSource(map, "ferry-vessels")?.setData(emptyCollection())
      } else {
        geoJsonSource(map, "ferry-piers")?.setData(ferryPierCollection(map, ferry, locale, labels))
      }
    }
    paint()
    map.on("zoomend", paint)
    return () => {
      map.off("zoomend", paint)
    }
  }, [disabled, ferry, layers.ferry, locale, mapReady, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const paint = () => {
      const labels = map.getZoom() >= LABEL_MIN_ZOOM
      const counts = map.getZoom() >= COUNT_MIN_ZOOM
      const hostParks = [
        ...(layers.parking && parking ? parking : []),
        ...(layers.motorcycle && motorcycles ? motorcycles : []),
      ]
      const hosted = layers.charger && chargers && hostParks.length > 0 ? chargersInsideParks(chargers, hostParks) : new globalThis.Map<string, ChargerPlace[]>()
      const motorcycleIdSet = layers.motorcycle && motorcycles ? new Set(motorcycles.map((park) => park.id)) : new Set<string>()
      const carIdSet = layers.parking && parking ? new Set(parking.filter((park) => park.cars != null).map((park) => park.id)) : new Set<string>()
      const parksDrawn = parking ? carPinsWhenBoth(parking, motorcycleIdSet.size > 0, motorcycleIdSet) : []
      const bikesDrawn = motorcycles ? motorcyclePinsWhenBoth(motorcycles) : []
      if (!layers.parking || !parking) {
        geoJsonSource(map, "parking")?.setData(emptyCollection())
      } else {
        geoJsonSource(map, "parking")?.setData(parkingCollection(map, parksDrawn, locale, labels, counts, hosted))
      }
      if (!layers.motorcycle || !motorcycles) {
        geoJsonSource(map, "motorcycle")?.setData(emptyCollection())
      } else {
        geoJsonSource(map, "motorcycle")?.setData(motorcycleCollection(map, bikesDrawn, locale, labels, counts, hosted, carIdSet))
      }
      if (!layers.charger || !chargers) {
        geoJsonSource(map, "chargers")?.setData(emptyCollection())
      } else {
        geoJsonSource(map, "chargers")?.setData(chargerCollection(map, chargers, locale, labels, counts, hosted))
      }
    }
    paint()
    map.on("zoomend", paint)
    return () => {
      map.off("zoomend", paint)
    }
  }, [chargers, disabled, layers.charger, layers.motorcycle, layers.parking, locale, mapReady, motorcycles, parking, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const paint = () => {
      const labels = map.getZoom() >= LABEL_MIN_ZOOM
      if (!layers.kerb || !kerbs) {
        geoJsonSource(map, "kerb")?.setData(emptyCollection())
      } else {
        geoJsonSource(map, "kerb")?.setData(kerbCollection(map, kerbs, locale, labels))
      }
    }
    paint()
    map.on("zoomend", paint)
    return () => {
      map.off("zoomend", paint)
    }
  }, [disabled, kerbs, layers.kerb, locale, mapReady, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const paint = () => {
      const labels = map.getZoom() >= LABEL_MIN_ZOOM
      const counts = map.getZoom() >= COUNT_MIN_ZOOM
      if (!layers.meter || !meters) {
        geoJsonSource(map, "meters")?.setData(emptyCollection())
      } else {
        geoJsonSource(map, "meters")?.setData(meterCollection(map, meters, locale, labels, counts))
      }
    }
    paint()
    map.on("zoomend", paint)
    return () => {
      map.off("zoomend", paint)
    }
  }, [disabled, layers.meter, locale, mapReady, meters, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const paint = () => {
      const labels = map.getZoom() >= LABEL_MIN_ZOOM
      if (mtrStations && mtrStations.length > 0) replaceMtrStationList(mtrStations)
      geoJsonSource(map, "mtr-stations")?.setData(platedStations(map, mtrStationCollection(), locale, "#7dd3e8", () => [], labels))
      geoJsonSource(map, "lrt-stations")?.setData(
        platedStations(map, lrtStationCollection(), locale, "#d4a017", (code) => lrtRoutesThrough(code), labels),
      )
    }
    paint()
    map.on("zoomend", paint)
    return () => {
      map.off("zoomend", paint)
    }
  }, [disabled, locale, mapReady, mtrStations, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const kinds: WatchLayer[] = ["speed", "cameras", "speedcam", "works", "tolls", "incidents", "control", "mtr", "kmb", "lrt", "citybus", "gmb", "nlb", "mtrbus", "ferry", "parking", "motorcycle", "kerb", "meter", "charger"]
    const sole = soleLayer(layers)
    const pinZoom: Partial<Record<string, number>> = {
      "kmb-stops": placePinZoom("kmb", sole, basemap),
      parking: placePinZoom("parking", sole, basemap),
      "parking-label": placePinZoom("parking", sole, basemap),
      motorcycle: placePinZoom("motorcycle", sole, basemap),
      "motorcycle-label": placePinZoom("motorcycle", sole, basemap),
      kerb: placePinZoom("kerb", sole, basemap),
      meters: placePinZoom("meter", sole, basemap),
      "meters-label": placePinZoom("meter", sole, basemap),
      chargers: placePinZoom("charger", sole, basemap),
      "chargers-label": placePinZoom("charger", sole, basemap),
      "citybus-stops": placePinZoom("citybus", sole, basemap),
      "gmb-stops": placePinZoom("gmb", sole, basemap),
      "nlb-stops": placePinZoom("nlb", sole, basemap),
      "mtrbus-stops": placePinZoom("mtrbus", sole, basemap),
      "cameras-harbour": placePinZoom("cameras", sole, basemap),
      "cameras-portal": placePinZoom("cameras", sole, basemap),
      "cameras-city": placePinZoom("cameras", sole, basemap),
      "speed-cams": placePinZoom("speedcam", sole, basemap),
    }
    for (const kind of kinds) {
      for (const layerId of layerIds(kind)) {
        if (!map.getLayer(layerId)) continue
        map.setLayoutProperty(layerId, "visibility", layers[kind] ? "visible" : "none")
        const min = pinZoom[layerId]
        if (min != null) map.setLayerZoomRange(layerId, min, 24)
      }
    }
  }, [basemap, disabled, layers, mapReady, styleEpoch])

  function basemapTitle(mode: Basemap): string {
    switch (mode) {
      case "street":
        return messages.openStreet
      case "satellite":
        return messages.satelliteMap
      case "buildings":
        return messages.buildingsMap
      default: {
        const exhaustive: never = mode
        return exhaustive
      }
    }
  }

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        aria-label={basemapTitle(basemap)}
      />
      {unavailable ? (
        <p className="pointer-events-none absolute inset-x-6 top-[28%] z-[1] max-w-md text-sm leading-relaxed text-zinc-300">
          {messages.mapFailed}
        </p>
      ) : null}
    </>
  )
}

const creditShow = new WeakMap<HTMLElement, () => void>()
const creditDragBound = new WeakSet<Map>()

function holdDataCreditOpen(map: Map) {
  const root = map.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-attrib")
  const button = root?.querySelector<HTMLElement>("summary")
  if (!root || !button) return
  if (!creditShow.has(root)) {
    let closedByUser = false
    const show = () => {
      if (closedByUser) return
      root.classList.add("maplibregl-compact", "maplibregl-compact-show")
      root.setAttribute("open", "")
    }
    creditShow.set(root, show)
    button.addEventListener("click", () => {
      closedByUser = !root.classList.contains("maplibregl-compact-show")
    })
  }
  creditShow.get(root)?.()
  if (creditDragBound.has(map)) return
  creditDragBound.add(map)
  map.on("drag", () => {
    const live = map.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-attrib")
    if (live) creditShow.get(live)?.()
  })
}

function isGpuFailure(error: unknown): boolean {
  if (error instanceof GPUInitializationError) return true
  const message = error instanceof Error ? error.message : ""
  return /webgl|gpu initialization/i.test(message)
}

function approachIconId(colour: HarbourJourney["colour"], label: string): string {
  return `approach-${colour}-${encodeURIComponent(label)}`
}

function ensureApproachIcon(map: Map, id: string, label: string, colour: string) {
  if (map.hasImage(id)) return
  const image = approachPill(label, colour)
  if (image) map.addImage(id, image, { pixelRatio: 2 })
}

function approachPill(label: string, colour: string): ImageData | null {
  const scale = 2
  const family = getComputedStyle(document.body).fontFamily || "sans-serif"
  const font = `600 ${12 * scale}px ${family}`
  const probe = document.createElement("canvas").getContext("2d")
  if (!probe) return null
  probe.font = font
  const textWidth = Math.ceil(probe.measureText(label).width)
  const padX = 8 * scale
  const padY = 3 * scale
  const width = Math.max(1, textWidth + padX * 2)
  const height = Math.max(1, Math.ceil(12 * 1.2 * scale) + padY * 2)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null
  context.clearRect(0, 0, width, height)
  context.beginPath()
  context.roundRect(0, 0, width, height, height / 2)
  context.fillStyle = colour
  context.fill()
  context.font = font
  context.fillStyle = "#07131c"
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.fillText(label, width / 2, height / 2)
  return context.getImageData(0, 0, width, height)
}

function shortestMinutes(point: ApproachPoint): number | null {
  let best: number | null = null
  for (const leg of point.legs) {
    if (leg.minutes == null) continue
    if (best == null || leg.minutes < best) best = leg.minutes
  }
  return best
}

function worstColour(point: ApproachPoint): HarbourJourney["colour"] {
  const rank: Record<HarbourJourney["colour"], number> = { none: 0, green: 1, amber: 2, red: 3 }
  return point.legs.reduce<HarbourJourney["colour"]>((worst, leg) => {
    return rank[leg.colour] > rank[worst] ? leg.colour : worst
  }, "none")
}

function incidentPoints(collection: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.filter((feature) => feature.geometry?.type === "Point"),
  }
}

function publishCorridors(
  map: Map,
  corridors: Corridor[],
  linesRef: MutableRefObject<AnimLine[]>,
  particlesRef: MutableRefObject<Particle[]>,
  m: Messages,
) {
  const source = geoJsonSource(map, "corridors")
  if (!source) return

  const features: GeoJSON.Feature[] = []
  for (const corridor of corridors) {
    const origin = corridor.coordinates[0]
    if (!origin) continue
    const color = BAND_COLOR[corridor.band]
    const properties = {
      name: displayText(m.locale, corridor.roadTc, corridor.roadEn),
      nameEn: m.locale === "en" ? "" : corridor.roadEn,
      direction: corridor.direction,
      speed: corridor.speedKmh == null ? m.noReading : m.speedKmh(Math.round(corridor.speedKmh)),
      band: corridor.band,
      color,
    }
    features.push({
      type: "Feature",
      properties,
      geometry:
        corridor.coordinates.length < 2
          ? { type: "Point", coordinates: origin }
          : { type: "LineString", coordinates: corridor.coordinates },
    })
  }
  source.setData({ type: "FeatureCollection", features })

  const lines: AnimLine[] = []
  corridors.forEach((corridor) => {
    if (corridor.coordinates.length < 2 || corridor.band === "unknown" || corridor.speedKmh == null) return
    const cum = [0]
    for (let index = 1; index < corridor.coordinates.length; index += 1) {
      const previous = corridor.coordinates[index - 1]
      const point = corridor.coordinates[index]
      if (!previous || !point) continue
      const dLng = (point[0] - previous[0]) * 102
      const dLat = (point[1] - previous[1]) * 111
      cum.push((cum[cum.length - 1] ?? 0) + Math.hypot(dLng, dLat))
    }
    lines.push({
      coords: corridor.coordinates,
      cum,
      band: corridor.band,
      speed: corridor.speedKmh,
    })
  })
  linesRef.current = lines
  const particles: Particle[] = []
  const ranked = lines
    .map((line, lineIndex) => ({ line, lineIndex, distance: harbourDistance(line.coords) }))
    .sort((a, b) => a.distance - b.distance)
  for (const entry of ranked) {
    const total = entry.line.cum[entry.line.cum.length - 1] ?? 0
    const count = Math.max(1, Math.min(4, Math.round(total / 1.2)))
    for (let index = 0; index < count; index += 1) {
      particles.push({ line: entry.lineIndex, t: (index + 0.15) / count })
      if (particles.length >= 280) break
    }
    if (particles.length >= 280) break
  }
  particlesRef.current = particles
}

function harbourDistance(coords: [number, number][]): number {
  const mid = coords[Math.floor(coords.length / 2)]
  if (!mid) return 99
  const dLng = (mid[0] - 114.175) * 102
  const dLat = (mid[1] - 22.293) * 111
  return Math.hypot(dLng, dLat)
}

function layerShown(map: Map, layerId: string): boolean {
  return Boolean(map.getLayer(layerId)) && map.getLayoutProperty(layerId, "visibility") !== "none"
}

function advanceParticles(lines: AnimLine[], particles: Particle[], dt: number): void {
  for (const particle of particles) {
    const line = lines[particle.line]
    if (!line) continue
    const pace = Math.max(0.25, line.speed / 50) * 0.075
    particle.t = (particle.t + pace * dt) % 1
  }
}

function particleFeatures(lines: AnimLine[], particles: Particle[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const particle of particles) {
    const line = lines[particle.line]
    if (!line) continue
    features.push({
      type: "Feature",
      properties: { color: BAND_COLOR[line.band] },
      geometry: { type: "Point", coordinates: pointAlong(line, particle.t) },
    })
  }
  return { type: "FeatureCollection", features }
}

function pushMovingSource(
  source: GeoJSONSource,
  gate: PushGate,
  data: GeoJSON.FeatureCollection,
  now: number,
  gapMs: number,
): void {
  if (!source.loaded()) return
  if (!beginPush(gate, now, gapMs)) return
  try {
    source.setData(data).then(
      () => endPush(gate),
      () => endPush(gate),
    )
  } catch {
    endPush(gate)
  }
}

function moveVehicles(
  map: Map,
  sourceId: string,
  gate: PushGate,
  moving: GeoJSON.FeatureCollection,
  phone: boolean,
  now: number,
  gapMs: number,
) {
  const source = geoJsonSource(map, sourceId)
  if (!source) return
  if (phone) pushMovingSource(source, gate, moving, now, gapMs)
  else source.setData(moving)
}

function pointAlong(line: AnimLine, t: number): [number, number] {
  const total = line.cum[line.cum.length - 1] ?? 0
  const first = line.coords[0]
  if (!first || total <= 0) return first ?? [114.15, 22.3]
  const target = t * total
  let index = 1
  while (index < line.cum.length - 1 && (line.cum[index] ?? 0) < target) index += 1
  const start = line.cum[index - 1] ?? 0
  const end = line.cum[index] ?? start
  const span = end - start || 1
  const mix = (target - start) / span
  const a = line.coords[index - 1] ?? first
  const b = line.coords[index] ?? a
  return [a[0] + (b[0] - a[0]) * mix, a[1] + (b[1] - a[1]) * mix]
}

function geoJsonSource(map: Map, id: string): GeoJSONSource | null {
  const source = map.getSource(id)
  return source instanceof GeoJSONSource ? source : null
}

function bindOverlayClicks(
  map: Map,
  showPopup: (lngLat: LngLat, content: HTMLElement) => void,
  copyRef: MutableRefObject<Messages>,
  approachesRef: MutableRefObject<ApproachPoint[]>,
  mtrRef: MutableRefObject<MtrResponse | null>,
  lrtRef: MutableRefObject<LrtResponse | null>,
) {
  const watchLayers = WATCH_HITS.filter((layerId) => map.getLayer(layerId))
  const onCorridorClick = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
    if (watchLayers.length > 0) {
      const covering = map.queryRenderedFeatures(event.point, { layers: watchLayers })
      if (covering.length > 0) return
    }
    const feature = event.features?.[0]
    if (!feature) return
    showPopup(event.lngLat, corridorPopup(feature.properties ?? null, copyRef.current))
  }
  map.on("click", "corridor-line", onCorridorClick)
  map.on("click", "corridor-point", onCorridorClick)
  const featurePopups: Record<string, (properties: GeoJSON.GeoJsonProperties, copy: Messages) => HTMLElement> = {
    "cameras-harbour": cameraPopup,
    "cameras-portal": cameraPopup,
    "cameras-city": cameraPopup,
    works: workPopup,
    "tolls-portal": tollPopup,
    "tolls-overview": tollPopup,
    incidents: incidentPopup,
    "speed-cams": speedCamPopup,
    "control-points": controlPointPopup,
    "mtr-stations": (properties) => stationPopup(properties, mtrRef.current, copyRef.current),
    "mtr-station-label": (properties) => stationPopup(properties, mtrRef.current, copyRef.current),
    "mtr-trains": (properties) => trainPopup(properties, mtrRef.current, copyRef.current),
    "mtr-train-label": (properties) => trainPopup(properties, mtrRef.current, copyRef.current),
    "kmb-stops": kmbStopPopup,
    "kmb-stop-label": kmbStopPopup,
    "lrt-stations": (properties) => lrtStationPopup(properties, lrtRef.current, copyRef.current),
    "lrt-station-label": (properties) => lrtStationPopup(properties, lrtRef.current, copyRef.current),
    "lrt-trains": (properties) => lrtTrainPopup(properties, lrtRef.current, copyRef.current),
    "lrt-train-label": (properties) => lrtTrainPopup(properties, lrtRef.current, copyRef.current),
    "citybus-stops": citybusStopPopup,
    "citybus-stop-label": citybusStopPopup,
    "gmb-stops": gmbStopPopup,
    "gmb-stop-label": gmbStopPopup,
    "nlb-stops": nlbStopPopup,
    "nlb-stop-label": nlbStopPopup,
    "mtrbus-stops": mtrBusStopPopup,
    "mtrbus-stop-label": mtrBusStopPopup,
    "ferry-piers": ferryStopPopup,
    "ferry-pier-label": ferryStopPopup,
    "ferry-vessels": ferryStopPopup,
    "ferry-vessel-label": ferryStopPopup,
    parking: parkingPopup,
    "parking-label": parkingPopup,
    motorcycle: parkingPopup,
    "motorcycle-label": parkingPopup,
    kerb: kerbPopup,
    "kerb-label": kerbPopup,
    meters: meterPopup,
    "meters-label": meterPopup,
    chargers: chargerPopup,
    "chargers-label": chargerPopup,
  }
  map.on("click", "approach-times", (event) => {
    const raw = event.features?.[0]?.properties?.id
    const id = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : ""
    const point = approachesRef.current.find((item) => item.id === id)
    if (!point) return
    showPopup(event.lngLat, approachPopup(point, copyRef.current))
  })
  for (const layerId of watchLayers) {
    const render = featurePopups[layerId]
    if (!render) continue
    map.on("click", layerId, (event) => openFeature(showPopup, event, (properties) => render(properties, copyRef.current), copyRef))
  }
  for (const layerId of ["corridor-line", ...watchLayers]) {
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer"
    })
    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = ""
    })
  }
}

let placeListenDrop: (() => void) | null = null

function dropPlaceListen() {
  placeListenDrop?.()
  placeListenDrop = null
}

function popupOpener(map: Map) {
  let active: Popup | null = null
  return {
    show(lngLat: LngLat, content: HTMLElement) {
      dropPlaceListen()
      active?.remove()
      active = new Popup({ className: "city-popup", closeButton: true, maxWidth: "360px", offset: 16 })
        .setLngLat(lngLat)
        .setDOMContent(content)
        .addTo(map)
      active.once("close", dropPlaceListen)
      keepCardInView(map, active)
    },
    close() {
      dropPlaceListen()
      active?.remove()
      active = null
    },
  }
}

const POPUP_ANCHORS = ["center", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"] as const
type PopupAnchor = (typeof POPUP_ANCHORS)[number]

function keepCardInView(map: Map, popup: Popup) {
  const element = popup.getElement()
  if (!element) return
  let queued = false
  let anchorLocked = false
  const fit = () => {
    if (queued || !popup.isOpen()) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      if (!popup.isOpen()) return
      anchorLocked = placeCard(map, popup, element, anchorLocked)
    })
  }
  fit()
  const observer = new ResizeObserver(fit)
  observer.observe(element)
  const image = element.querySelector("img")
  image?.addEventListener("load", fit)
  const release = () => {
    if (!popup.isOpen()) return
    if (!anchorOnMap(map, popup)) popup.remove()
  }
  map.on("move", release)
  map.on("moveend", fit)
  map.on("idle", fit)
  popup.once("close", () => {
    observer.disconnect()
    image?.removeEventListener("load", fit)
    map.off("move", release)
    map.off("moveend", fit)
    map.off("idle", fit)
  })
}

function anchorOnMap(map: Map, popup: Popup): boolean {
  const point = map.project(popup.getLngLat())
  const canvas = map.getCanvas()
  return point.x >= 0 && point.y >= 0 && point.x <= canvas.clientWidth && point.y <= canvas.clientHeight
}

function placeCard(map: Map, popup: Popup, element: HTMLElement, anchorLocked: boolean) {
  const limits = cardLimits(map)
  const mapBox = map.getContainer().getBoundingClientRect()
  popup.options.padding = {
    top: Math.max(0, limits.top - mapBox.top),
    right: Math.max(0, mapBox.right - limits.right),
    bottom: Math.max(0, mapBox.bottom - limits.bottom),
    left: Math.max(0, limits.left - mapBox.left),
  }
  fitCameraCard(element, limits)
  if (!anchorLocked) {
    popup.options.anchor = undefined
    popup.setOffset(popup.options.offset ?? 16)
    const anchor = popupAnchor(element)
    if (anchor) {
      popup.options.anchor = anchor
      anchorLocked = true
      popup.setOffset([0, 0])
    }
  }
  if (!anchorLocked) return false
  // The snapshot loads after the tip is placed, and the tip shift is a percentage
  // of the card. Slide the whole card until it sits in the open gap.
  let [ox, oy] = offsetPair(popup.options.offset)
  for (let pass = 0; pass < 3; pass += 1) {
    const box = element.getBoundingClientRect()
    const dx = Math.round(-overflowShift(box.left, box.right, limits.left, limits.right))
    const dy = Math.round(-overflowShift(box.top, box.bottom, limits.top, limits.bottom))
    if (dx === 0 && dy === 0) break
    ox += dx
    oy += dy
    popup.setOffset([ox, oy])
  }
  return true
}

function offsetPair(offset: Popup["options"]["offset"]): [number, number] {
  if (Array.isArray(offset)) return [Number(offset[0]) || 0, Number(offset[1]) || 0]
  return [0, 0]
}

function popupAnchor(element: HTMLElement): PopupAnchor | null {
  for (const name of POPUP_ANCHORS) {
    if (element.classList.contains(`maplibregl-popup-anchor-${name}`)) return name
  }
  return null
}

function fitCameraCard(element: HTMLElement, limits: CardLimits) {
  const availableW = limits.right - limits.left
  const availableH = limits.bottom - limits.top
  const card = element.querySelector(".city-card")
  if (card instanceof HTMLElement && availableW > 40) {
    const width = Math.min(300, Math.max(140, Math.floor(availableW - 28)))
    const next = `${width}px`
    if (card.style.maxWidth !== next) card.style.maxWidth = next
  }
  const image = element.querySelector(".city-card-figure img")
  if (!(image instanceof HTMLImageElement) || availableH < 40) return
  const imageBox = image.getBoundingClientRect()
  const rest = element.getBoundingClientRect().height - imageBox.height
  const cssCap = Math.min(220, window.innerHeight * 0.34)
  let cap = Math.min(cssCap, Math.max(0, Math.floor(availableH - rest)))
  const current = Number.parseFloat(image.style.maxHeight)
  if (!Number.isFinite(current) || Math.abs(current - cap) > 2) {
    image.style.maxHeight = `${Math.floor(cap)}px`
    const overflow = element.getBoundingClientRect().height - availableH
    if (overflow > 2) {
      cap = Math.max(0, Math.floor(image.getBoundingClientRect().height - overflow))
      image.style.maxHeight = `${cap}px`
    }
  }
}

function overflowShift(start: number, end: number, min: number, max: number): number {
  if (max <= min) return start - min
  if (end - start > max - min) return start - min
  if (start < min) return start - min
  if (end > max) return end - max
  return 0
}

type CardLimits = { top: number; right: number; bottom: number; left: number }

function cardLimits(map: Map): CardLimits {
  const mapBox = map.getContainer().getBoundingClientRect()
  let top = mapBox.top + 10
  let bottom = mapBox.bottom - 10
  let left = mapBox.left + 10
  let right = mapBox.right - 10
  for (const node of document.querySelectorAll<HTMLElement>("[data-map-chrome]")) {
    const box = node.getBoundingClientRect()
    if (box.width < 2 || box.height < 2) continue
    const kind = node.dataset.mapChrome
    if (kind === "top") top = Math.max(top, box.bottom + 10)
    if (kind === "bottom") bottom = Math.min(bottom, box.top - 10)
    if (kind === "panel") {
      const spansWidth = box.width > mapBox.width * 0.72
      const onRight = box.left > mapBox.left + mapBox.width * 0.35
      if (!spansWidth && onRight) right = Math.min(right, box.left - 10)
      else if (box.height < 88) bottom = Math.min(bottom, box.top - 10)
      // An open list fills the phone. The card draws above it so the snapshot stays readable.
    }
  }
  const root = map.getContainer()
  const zoom = root.querySelector(".maplibregl-ctrl-top-left")
  if (zoom instanceof HTMLElement) {
    const box = zoom.getBoundingClientRect()
    if (box.width > 2 && box.height > 2) left = Math.max(left, box.right + 10)
  }
  const credit = root.querySelector(".maplibregl-ctrl-bottom-right")
  if (credit instanceof HTMLElement) {
    const box = credit.getBoundingClientRect()
    if (box.width > 2 && box.height > 2) bottom = Math.min(bottom, box.top - 10)
  }
  return { top, right, bottom, left }
}

function openFeature(
  showPopup: (lngLat: LngLat, content: HTMLElement) => void,
  event: MapMouseEvent & { features?: MapGeoJSONFeature[] },
  render: (properties: GeoJSON.GeoJsonProperties) => HTMLElement,
  copyRef: MutableRefObject<Messages>,
) {
  const feature = event.features?.[0]
  if (!feature) return
  const root = render(feature.properties ?? null)
  const place = favouriteFromHit(feature.layer.id, feature.properties ?? null, feature.geometry)
  if (place) {
    const starred = placesSnapshot().some((item) => item.layer === place.layer && item.id === place.id)
    const copy = copyRef.current
    stampPlaceStar(root, place, starred, { star: copy.star, starred: copy.starred, placesFull: copy.placesFull }, (chosen) => {
      const next = togglePlace(placesSnapshot(), chosen)
      replacePlaces(next)
      return next
    })
  }
  showPopup(event.lngLat, root)
  if (place) {
    placeListenDrop = subscribePlaces(() => {
      const starred = placesSnapshot().some((item) => item.layer === place.layer && item.id === place.id)
      const button = root.querySelector("button.city-card-head-star")
      if (!(button instanceof HTMLButtonElement)) return
      const copy = copyRef.current
      paintPlaceStar(button, starred, { star: copy.star, starred: copy.starred })
    })
  }
}

