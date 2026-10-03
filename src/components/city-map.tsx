"use client"

import { useEffect, useRef, useState, type MutableRefObject } from "react"
import {
  GeoJSONSource,
  GPUInitializationError,
  Map,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type ErrorEvent,
  type FilterSpecification,
  type LngLat,
  type MapGeoJSONFeature,
  type MapMouseEvent,
  type SkySpecification,
  type StyleSpecification,
} from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { useI18n } from "@/components/locale"
import {
  approachPopup,
  cameraPopup,
  controlPointPopup,
  kmbStopPopup,
  citybusStopPopup,
  ferryStopPopup,
  gmbStopPopup,
  lrtStationPopup,
  nlbStopPopup,
  lrtTrainPopup,
  corridorPopup,
  incidentPopup,
  readablePlace,
  stationPopup,
  tollPopup,
  trainPopup,
  workPopup,
} from "@/components/map-cards"
import { stopPlate, stopPlateKey, type StopPlate } from "@/lib/stop-plate"
import { KMB_MIN_ZOOM, kmbViewKey } from "@/lib/kmb-view"
import { displayText, type Locale, type Messages } from "@/lib/i18n"
import { lineRecord, mtrStationCollection, mtrTrackCollection, stationPoint, stationRecord } from "@/lib/mtr-network"
import { lrtColor, lrtPoint, lrtRoutesThrough, lrtStation, lrtStationCollection, lrtTrackCollection } from "@/lib/lrt-network"
import { ferryPierFeatures, ferryVesselFeatures } from "@/lib/ferry-network"
import { beginPush, endPush, type PushGate } from "@/lib/frame-push"
import { advanceRuns, mergeRuns, runCollection, runsFromTrains, type TrainRun } from "@/lib/mtr-run"
import { skyFor, sunAltitude } from "@/lib/sun-sky"
import type { ApproachPoint, Basemap, CitybusResponse, Corridor, FerryResponse, GmbResponse, HarbourJourney, KmbResponse, LrtResponse, MtrResponse, NlbResponse, PictureResponse, SpeedBand, WatchLayer, WatchLayers } from "@/lib/types"

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

// A pitched camera shows the horizon. Without a sky the space above it is empty
// black; this fills it with a gradient that follows the sun over Hong Kong.
const SKY_REFRESH_MS = 5 * 60 * 1000

function skyNow(): SkySpecification {
  return skyFor(sunAltitude(new Date(), 22.3, 114.17))
}

const LABEL_MIN_ZOOM = 16.5
const LABEL_REFRESH_MS = 700
let plateFamily = ""

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

function rasterTileSize(): number {
  // The satellite source is 256 px tiles. On a phone the pitched view asks for the
  // next zoom level across most of the screen. Treating each tile as 512 px asks
  // for the coarser zoom, so the first picture is about a quarter of the images.
  return narrowScreen() ? 512 : 256
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
        tileSize: rasterTileSize(),
        // Hong Kong imagery is real through zoom 19. Zoom 20 and above is Esri's
        // gray "Map Data Not Yet Available" tile, so the map scales the zoom 19 picture.
        maxzoom: 19,
        attribution: "© Esri",
      },
      labels: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: rasterTileSize(),
      },
    },
    layers: [
      { id: "satellite", type: "raster", source: "imagery" },
      { id: "places", type: "raster", source: "labels", paint: { "raster-opacity": 0.88 } },
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
      return { ...step, zoom: Math.max(step.zoom, 15.2), pitch: Math.max(step.pitch, 60) }
    default: {
      const exhaustive: never = basemap
      return exhaustive
    }
  }
}

const FLYOVER = [
  { center: [114.148, 22.3] as [number, number], zoom: 12.7, pitch: 60, bearing: -8, duration: 7000, curve: 1.25 },
  { center: [114.21, 22.3] as [number, number], zoom: 12.55, pitch: 54, bearing: 18, duration: 7600, curve: 1.25 },
  { center: [114.178, 22.292] as [number, number], zoom: 13.05, pitch: 52, bearing: -12, duration: 7200, curve: 1.2 },
]

const WATCH_HITS = ["approach-times", "incidents", "cameras-harbour", "cameras-portal", "cameras-city", "works", "tolls-portal", "tolls-overview", "control-points", "mtr-stations", "mtr-station-label", "mtr-trains", "mtr-train-label", "kmb-stops", "kmb-stop-label", "lrt-stations", "lrt-station-label", "lrt-trains", "lrt-train-label", "citybus-stops", "citybus-stop-label", "gmb-stops", "gmb-stop-label", "nlb-stops", "nlb-stop-label", "ferry-piers", "ferry-pier-label", "ferry-vessels"]

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
  incidents: GeoJSON.FeatureCollection | null
  controlPoints: GeoJSON.FeatureCollection | null
  mtr: MtrResponse | null
  kmb: KmbResponse | null
  lrt: LrtResponse | null
  citybus: CitybusResponse | null
  gmb: GmbResponse | null
  nlb: NlbResponse | null
  ferry: FerryResponse | null
  onView: (view: { lng: number; lat: number; zoom: number }) => void
  layers: WatchLayers
  basemap: Basemap
  flyToken: number
  focus: { id: string; coordinates: [number, number] } | null
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
  incidents,
  controlPoints,
  mtr,
  kmb,
  lrt,
  citybus,
  gmb,
  nlb,
  ferry,
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
  }, [locale, messages])

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
    const report = () => {
      const centre = map.getCenter()
      const zoom = map.getZoom()
      const key = kmbViewKey(centre.lng, centre.lat, zoom)
      if (viewKeyRef.current === key) return
      viewKeyRef.current = key
      onViewRef.current({ lng: centre.lng, lat: centre.lat, zoom })
    }
    report()
    map.on("moveend", report)
    return () => {
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
    )
  }, [lrt])

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
      // setStyle drops the sky with the rest of the style, so it comes back here too.
      map.setSky(skyNow())
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
    const pushGap = ios ? 140 : 0
    const gates: Record<"particles" | "mtr" | "lrt", PushGate> = {
      particles: { busy: false, at: 0 },
      mtr: { busy: false, at: 0 },
      lrt: { busy: false, at: 0 },
    }
    let keep: HTMLDivElement | null = null
    if (ios) {
      keep = document.createElement("div")
      keep.setAttribute("aria-hidden", "true")
      keep.className = "ios-frame-keep"
      document.body.appendChild(keep)
    }
    const motionReady = { mtr: false, lrt: false, at: 0 }
    const refreshTrainLabels = (map: Map, now: number) => {
      const show = map.getZoom() >= LABEL_MIN_ZOOM
      if (!show) {
        if (!motionReady.mtr && !motionReady.lrt) return
        if (motionReady.mtr) geoJsonSource(map, "mtr-train-labels")?.setData(emptyCollection())
        if (motionReady.lrt) geoJsonSource(map, "lrt-train-labels")?.setData(emptyCollection())
        motionReady.mtr = false
        motionReady.lrt = false
        return
      }
      if (now - motionReady.at < LABEL_REFRESH_MS && (motionReady.mtr || motionReady.lrt)) return
      motionReady.at = now
      const publish = (sourceId: string, layerId: string, mode: "mtr" | "lrt", runs: TrainRun[], locate: (code: string) => { lng: number; lat: number } | null) => {
        const source = geoJsonSource(map, sourceId)
        if (!source) return
        if (!layerShown(map, layerId)) {
          if (motionReady[mode]) source.setData(emptyCollection())
          motionReady[mode] = false
          return
        }
        source.setData(withTrainMarks(map, runCollection(runs, locate), localeRef.current, mode))
        motionReady[mode] = true
      }
      publish("mtr-train-labels", "mtr-train-label", "mtr", runsRef.current, stationPoint)
      publish("lrt-train-labels", "lrt-train-label", "lrt", lrtRunsRef.current, lrtPoint)
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
          const moving = particleCollection(linesRef.current, particlesRef.current, dt)
          if (ios) pushMovingSource(particles, gates.particles, moving, now, pushGap)
          else particles.setData(moving)
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
        const trains = geoJsonSource(current, "mtr-trains")
        if (trains && layerShown(current, "mtr-trains")) {
          runsRef.current = advanceRuns(runsRef.current, trainStep, stationPoint)
          const moving = runCollection(runsRef.current, stationPoint)
          if (ios) pushMovingSource(trains, gates.mtr, moving, now, pushGap)
          else trains.setData(moving)
        }
        const lightRail = geoJsonSource(current, "lrt-trains")
        if (lightRail && layerShown(current, "lrt-trains")) {
          lrtRunsRef.current = advanceRuns(lrtRunsRef.current, trainStep, lrtPoint)
          const moving = runCollection(lrtRunsRef.current, lrtPoint)
          if (ios) pushMovingSource(lightRail, gates.lrt, moving, now, pushGap)
          else lightRail.setData(moving)
        }
        refreshTrainLabels(current, now)
      }
    }
    const tick = () => {
      step()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const pulse = ios ? window.setInterval(step, 140) : 0
    // The sun moves slowly; a basemap swap mid-load picks the sky up in restoreOverlays.
    const sky = window.setInterval(() => {
      if (readyRef.current) map.setSky(skyNow())
    }, SKY_REFRESH_MS)

    return () => {
      active = false
      cancelAnimationFrame(frame)
      if (pulse) window.clearInterval(pulse)
      window.clearInterval(sky)
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
    map.flyTo({
      center: focus.coordinates,
      zoom: Math.max(map.getZoom(), basemapRef.current === "buildings" && !narrowScreen() ? 15.6 : 14.2),
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
    const features: GeoJSON.Feature[] = approaches.map((point) => {
      const colour = worstColour(point)
      const minutes = shortestMinutes(point)
      const label = minutes == null ? "—" : messages.minutes(minutes)
      const icon = approachIconId(colour, label)
      ensureApproachIcon(map, icon, label, PILL[colour])
      return {
        type: "Feature",
        properties: { id: point.id, icon },
        geometry: { type: "Point", coordinates: point.coordinates },
      }
    })
    geoJsonSource(map, "approaches")?.setData({ type: "FeatureCollection", features })
  }, [approaches, disabled, mapReady, locale, messages, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const paint = () => {
      const labels = map.getZoom() >= LABEL_MIN_ZOOM
      geoJsonSource(map, "cameras")?.setData(picture?.cameras ?? emptyCollection())
      geoJsonSource(map, "works")?.setData(picture?.works ?? emptyCollection())
      geoJsonSource(map, "tolls")?.setData(picture?.tolls ?? emptyCollection())
      geoJsonSource(map, "incidents")?.setData(incidents ?? emptyCollection())
      geoJsonSource(map, "control-points")?.setData(controlPoints ?? emptyCollection())
      if (!mtr?.ok) {
        geoJsonSource(map, "mtr-trains")?.setData(emptyCollection())
        geoJsonSource(map, "mtr-train-labels")?.setData(emptyCollection())
      }
      if (!layers.kmb) {
        geoJsonSource(map, "kmb-stops")?.setData(emptyCollection())
      } else if (kmb?.ok) {
        geoJsonSource(map, "kmb-stops")?.setData(kmbStopCollection(map, kmb, locale, labels))
      }
      if (!layers.lrt) {
        geoJsonSource(map, "lrt-trains")?.setData(emptyCollection())
        geoJsonSource(map, "lrt-train-labels")?.setData(emptyCollection())
      }
      if (!layers.citybus) {
        geoJsonSource(map, "citybus-stops")?.setData(emptyCollection())
      } else if (citybus?.ok) {
        geoJsonSource(map, "citybus-stops")?.setData(busStopCollection(map, citybus, locale, labels, "#c2410c"))
      }
      if (!layers.gmb) {
        geoJsonSource(map, "gmb-stops")?.setData(emptyCollection())
      } else if (gmb?.ok) {
        geoJsonSource(map, "gmb-stops")?.setData(busStopCollection(map, gmb, locale, labels, "#65a30d"))
      }
      if (!layers.nlb) {
        geoJsonSource(map, "nlb-stops")?.setData(emptyCollection())
      } else if (nlb?.ok) {
        geoJsonSource(map, "nlb-stops")?.setData(busStopCollection(map, nlb, locale, labels, "#0f766e"))
      }
      if (!layers.ferry) {
        geoJsonSource(map, "ferry-piers")?.setData(emptyCollection())
        geoJsonSource(map, "ferry-vessels")?.setData(emptyCollection())
      } else {
        geoJsonSource(map, "ferry-piers")?.setData(ferryPierCollection(map, ferry, locale, labels))
        geoJsonSource(map, "ferry-vessels")?.setData(ferryVesselFeatures(ferry))
      }
    }
    paint()
    map.on("zoomend", paint)
    return () => {
      map.off("zoomend", paint)
    }
  }, [citybus, controlPoints, disabled, ferry, gmb, incidents, kmb, layers.citybus, layers.ferry, layers.gmb, layers.kmb, layers.lrt, layers.nlb, locale, lrt, mapReady, mtr, nlb, picture, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const paint = () => {
      const labels = map.getZoom() >= LABEL_MIN_ZOOM
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
  }, [disabled, locale, mapReady, styleEpoch])

  useEffect(() => {
    const map = mapRef.current
    if (disabled || !map || !mapReady) return
    const kinds: WatchLayer[] = ["speed", "cameras", "works", "tolls", "incidents", "control", "mtr", "kmb", "lrt", "citybus", "gmb", "nlb", "ferry"]
    for (const kind of kinds) {
      for (const layerId of layerIds(kind)) {
        if (!map.getLayer(layerId)) continue
        map.setLayoutProperty(layerId, "visibility", layers[kind] ? "visible" : "none")
      }
    }
  }, [disabled, layers, mapReady, styleEpoch])

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

function stopPlateIconId(plate: StopPlate, stroke: string): string {
  return `stop-plate-${stroke.slice(1)}-${encodeURIComponent(stopPlateKey(plate))}`
}

function placeStopPlate(map: Map, name: string, routes: string[], stroke: string): string {
  const plate = stopPlate(name, routes)
  if (!plate.title && plate.lines.length === 0) return ""
  const icon = stopPlateIconId(plate, stroke)
  ensureStopPlate(map, icon, plate, stroke)
  return map.hasImage(icon) ? icon : ""
}

function withTrainMarks(
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
    const icon = placeStopPlate(map, name, route ? [route] : [], stroke)
    if (icon) properties.icon = icon
  }
  return collection
}

function ensureStopPlate(map: Map, id: string, plate: StopPlate, stroke: string) {
  if (map.hasImage(id)) return
  const image = stopPlateImage(plate, stroke)
  if (image) map.addImage(id, image, { pixelRatio: 2 })
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
  if (rows.length === 0) return null
  const widths = rows.map((row, index) => {
    probe.font = index === 0 && plate.title ? titleFont : routeFont
    return Math.ceil(probe.measureText(row).width)
  })
  const padX = 6 * scale
  const padY = 4 * scale
  const lineHeight = 13 * scale
  const width = Math.max(1, Math.max(...widths) + padX * 2)
  const height = Math.max(1, rows.length * lineHeight + padY * 2)
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
  context.textAlign = "left"
  context.textBaseline = "middle"
  rows.forEach((row, index) => {
    const titleRow = index === 0 && plate.title
    context.font = titleRow ? titleFont : routeFont
    context.fillStyle = titleRow ? "#fff8e8" : "#ffedd5"
    context.fillText(row, padX, padY + lineHeight * index + lineHeight / 2)
  })
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

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] }
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

function particleCollection(lines: AnimLine[], particles: Particle[], dt: number): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const particle of particles) {
    const line = lines[particle.line]
    if (!line) continue
    const pace = Math.max(0.25, line.speed / 50) * 0.075
    particle.t = (particle.t + pace * dt) % 1
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

function overlaySlot(map: Map): string | undefined {
  // Style labels stay above the traffic drawing. On Liberty the first label is
  // also below the extruded buildings, so those roofs still cover the markers.
  const layers = map.getStyle()?.layers
  if (!layers) return undefined
  return layers.find((layer) => layer.type === "symbol")?.id
}

function addOverlay(map: Map, layer: Parameters<Map["addLayer"]>[0], before: string | undefined) {
  if (before && map.getLayer(before)) map.addLayer(layer, before)
  else map.addLayer(layer)
}

function addStopLabel(map: Map, id: string, source: string, before: string | undefined) {
  addOverlay(map, {
    id,
    type: "symbol",
    source,
    minzoom: LABEL_MIN_ZOOM,
    filter: ["has", "icon"],
    layout: {
      "icon-image": ["get", "icon"],
      "icon-anchor": "bottom",
      "icon-offset": [0, -10],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-pitch-alignment": "viewport",
      "icon-rotation-alignment": "viewport",
    },
  }, before)
}

function mountDataLayers(map: Map) {
  map.addSource("cameras", { type: "geojson", data: emptyCollection() })
  map.addSource("works", { type: "geojson", data: emptyCollection() })
  map.addSource("tolls", { type: "geojson", data: emptyCollection() })
  map.addSource("incidents", { type: "geojson", data: emptyCollection() })
  map.addSource("control-points", {
    type: "geojson",
    data: emptyCollection(),
    attribution: "© Immigration Department",
  })
  map.addSource("mtr-track", {
    type: "geojson",
    data: mtrTrackCollection(),
    attribution: "© MTR Corporation | © Lands Department",
  })
  map.addSource("mtr-stations", { type: "geojson", data: mtrStationCollection() })
  map.addSource("mtr-trains", { type: "geojson", data: emptyCollection() })
  map.addSource("mtr-train-labels", { type: "geojson", data: emptyCollection() })
  map.addSource("kmb-stops", { type: "geojson", data: emptyCollection() })
  map.addSource("lrt-track", {
    type: "geojson",
    data: lrtTrackCollection(),
    attribution: "© MTR Corporation",
  })
  map.addSource("lrt-stations", { type: "geojson", data: lrtStationCollection() })
  map.addSource("lrt-trains", { type: "geojson", data: emptyCollection() })
  map.addSource("lrt-train-labels", { type: "geojson", data: emptyCollection() })
  map.addSource("citybus-stops", { type: "geojson", data: emptyCollection() })
  map.addSource("gmb-stops", { type: "geojson", data: emptyCollection() })
  map.addSource("nlb-stops", { type: "geojson", data: emptyCollection() })
  map.addSource("ferry-piers", { type: "geojson", data: emptyCollection() })
  map.addSource("ferry-vessels", { type: "geojson", data: emptyCollection() })
  map.addSource("approaches", { type: "geojson", data: emptyCollection() })
  map.addSource("corridors", {
    type: "geojson",
    data: emptyCollection(),
    attribution: "© Transport Department",
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
    "ferry-piers": ferryStopPopup,
    "ferry-pier-label": ferryStopPopup,
    "ferry-vessels": ferryStopPopup,
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
    map.on("click", layerId, (event) => openFeature(showPopup, event, (properties) => render(properties, copyRef.current)))
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
    addCameraLayer(map, "cameras-harbour", ["==", ["get", "harbour"], 1], 11.6, before)
    addCameraLayer(map, "cameras-portal", ["all", ["==", ["get", "portal"], 1], ["!=", ["get", "harbour"], 1]], 11.6, before)
    addCameraLayer(map, "cameras-city", ["all", ["!=", ["get", "harbour"], 1], ["!=", ["get", "portal"], 1]], 14, before)
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
  addStopLabel(map, "mtr-train-label", "mtr-train-labels", before)
  addOverlay(map, {
    id: "kmb-stops",
    type: "circle",
    source: "kmb-stops",
    minzoom: KMB_MIN_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3.5, 16, 6],
      "circle-color": "#f7fbff",
      "circle-stroke-color": "#9f1239",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "kmb-stop-label", "kmb-stops", before)
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
  addStopLabel(map, "lrt-train-label", "lrt-train-labels", before)
  addOverlay(map, {
    id: "citybus-stops",
    type: "circle",
    source: "citybus-stops",
    minzoom: KMB_MIN_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3.5, 16, 6],
      "circle-color": "#fff8e8",
      "circle-stroke-color": "#c2410c",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "citybus-stop-label", "citybus-stops", before)
  addOverlay(map, {
    id: "gmb-stops",
    type: "circle",
    source: "gmb-stops",
    minzoom: KMB_MIN_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3.5, 16, 6],
      "circle-color": "#f7fee7",
      "circle-stroke-color": "#65a30d",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "gmb-stop-label", "gmb-stops", before)
  addOverlay(map, {
    id: "nlb-stops",
    type: "circle",
    source: "nlb-stops",
    minzoom: KMB_MIN_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3.5, 16, 6],
      "circle-color": "#f0fdfa",
      "circle-stroke-color": "#0f766e",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
  }, before)
  addStopLabel(map, "nlb-stop-label", "nlb-stops", before)
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

function cameraCone(): ImageData | null {
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null
  context.clearRect(0, 0, size, size)
  context.translate(size / 2, size / 2)
  context.beginPath()
  context.moveTo(0, 2)
  context.lineTo(-18, -26)
  context.quadraticCurveTo(0, -18, 18, -26)
  context.closePath()
  context.fillStyle = "rgba(125, 211, 232, 0.72)"
  context.fill()
  context.lineWidth = 2
  context.strokeStyle = "rgba(236, 254, 255, 0.95)"
  context.stroke()
  context.beginPath()
  context.arc(0, 2, 5, 0, Math.PI * 2)
  context.fillStyle = "#F4FEFF"
  context.fill()
  context.lineWidth = 1.5
  context.strokeStyle = "#083044"
  context.stroke()
  return context.getImageData(0, 0, size, size)
}

function busStopCollection(map: Map, board: CitybusResponse, locale: Locale, labels: boolean, stroke: string): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: board.stops.map((stop) => {
      const name = readablePlace(displayText(locale, stop.nameTc, stop.nameEn))
      const marks = stop.routes.length > 0 ? stop.routes : stop.calls.map((call) => call.route)
      const icon = labels ? placeStopPlate(map, name, marks, stroke) : ""
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [stop.lng, stop.lat] },
        properties: {
          nameTc: stop.nameTc,
          nameEn: stop.nameEn,
          board: JSON.stringify(stop.calls),
          routes: JSON.stringify(stop.routes),
          ...(icon ? { icon } : {}),
        },
      }
    }),
  }
}

function ferryPierCollection(map: Map, ferry: FerryResponse | null, locale: Locale, labels: boolean): GeoJSON.FeatureCollection {
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
          marks = parsed.flatMap((item) => {
            if (typeof item !== "object" || item === null) return []
            const route = (item as { route?: unknown }).route
            return typeof route === "string" && route ? [route] : []
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

function kmbStopCollection(map: Map, kmb: KmbResponse, locale: Locale, labels: boolean): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: kmb.stops.map((stop) => {
      const name = readablePlace(displayText(locale, stop.nameTc, stop.nameEn))
      const marks = stop.routes.length > 0 ? stop.routes : stop.calls.map((call) => call.route)
      const icon = labels ? placeStopPlate(map, name, marks, "#9f1239") : ""
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [stop.lng, stop.lat] },
        properties: {
          nameTc: stop.nameTc,
          nameEn: stop.nameEn,
          board: JSON.stringify(stop.calls),
          routes: JSON.stringify(stop.routes),
          ...(icon ? { icon } : {}),
        },
      }
    }),
  }
}

function platedStations(
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

function layerIds(kind: WatchLayer): string[] {
  switch (kind) {
    case "speed":
      return ["corridor-glow", "corridor-casing", "corridor-line", "corridor-point", "traffic-particles"]
    case "cameras":
      return ["cameras-harbour", "cameras-portal", "cameras-city"]
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
      return ["kmb-stops", "kmb-stop-label"]
    case "lrt":
      return ["lrt-track-casing", "lrt-track", "lrt-stations", "lrt-station-label", "lrt-trains", "lrt-train-label"]
    case "citybus":
      return ["citybus-stops", "citybus-stop-label"]
    case "gmb":
      return ["gmb-stops", "gmb-stop-label"]
    case "nlb":
      return ["nlb-stops", "nlb-stop-label"]
    case "ferry":
      return ["ferry-piers", "ferry-pier-label", "ferry-vessels"]
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

function popupOpener(map: Map) {
  let active: Popup | null = null
  return {
    show(lngLat: LngLat, content: HTMLElement) {
      active?.remove()
      active = new Popup({ className: "city-popup", closeButton: true, maxWidth: "360px", offset: 16 })
        .setLngLat(lngLat)
        .setDOMContent(content)
        .addTo(map)
      keepCardInView(map, active)
    },
    close() {
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
) {
  const feature = event.features?.[0]
  if (!feature) return
  showPopup(event.lngLat, render(feature.properties ?? null))
}

