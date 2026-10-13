import type { Basemap, WatchLayer } from "@/lib/types"

export const KMB_MIN_ZOOM = 13
// One dense catalogue on its own can appear from the city view.
export const SOLO_PIN_ZOOM = 10
// Street cams, speed cams, and free-count pins wait until the harbour frame has been left behind.
export const AVAILABILITY_MIN_ZOOM = 14
// The satellite and street sweep ends at 13.05. The buildings sweep never goes below 15.2.
export const FLYOVER_END_ZOOM = 13.05
export const BUILDINGS_FLYOVER_ZOOM = 15.2
export const PARK_METER_ZOOM = 13.55
export const BUILDINGS_PARK_METER_ZOOM = 15.7
export const PLACE_FOCUS_ZOOM = 16.5
export const KMB_POLL_MS = 60_000
export const PLACE_POLL_MS = 12 * 60 * 60 * 1000

const AVAILABILITY_LAYERS = new Set<WatchLayer>(["cameras", "speedcam", "charger"])
const AFTER_SWEEP = new Set<WatchLayer>([
  "parking",
  "meter",
  "motorcycle",
  "kerb",
  "kmb",
  "citybus",
  "gmb",
  "nlb",
  "mtrbus",
])

export function parkMeterZoom(basemap: Basemap): number {
  switch (basemap) {
    case "buildings":
      return BUILDINGS_PARK_METER_ZOOM
    case "street":
    case "satellite":
      return PARK_METER_ZOOM
    default: {
      const exhaustive: never = basemap
      return exhaustive
    }
  }
}

export function focusZoom(current: number, floor: number, requested?: number): number {
  return Math.max(current, floor, requested ?? floor)
}

export function placePinZoom(layer: WatchLayer, sole: WatchLayer | null, basemap: Basemap = "satellite"): number {
  if (sole === layer) return SOLO_PIN_ZOOM
  const pastSweep = parkMeterZoom(basemap)
  if (AFTER_SWEEP.has(layer)) return pastSweep
  if (AVAILABILITY_LAYERS.has(layer)) return Math.max(AVAILABILITY_MIN_ZOOM, pastSweep)
  return KMB_MIN_ZOOM
}

export function mapViewKey(lng: number, lat: number, zoom: number): string {
  if (!Number.isFinite(zoom) || zoom < SOLO_PIN_ZOOM) return "far"
  const band = zoom < KMB_MIN_ZOOM ? "overview" : zoom < 16 ? "wide" : zoom < 17 ? "street" : "close"
  return `${lng.toFixed(3)},${lat.toFixed(3)},${band}`
}
