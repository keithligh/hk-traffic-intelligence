import { mergeSamePoles } from "@/lib/kmb-pole"
import { nlbArrivalMs } from "@/lib/nlb-clock"
import { nlbPoleIds, nlbStop, nlbStopsSpread, nlbStopsWithin } from "@/lib/nlb-network"
import { kmbReachMetres, STOP_CAP } from "@/lib/kmb-reach"
import { readEtaJson } from "@/lib/eta-read"
import { loadPoleBoard } from "@/lib/pole-board"
import type { NlbCall, NlbPlacesResponse, NlbResponse, NlbStopBoard } from "@/lib/types"

// More than the mixed cap. The island list is short, so this can cover most of it and still stop early.
const SOLO_CAP = 120
const ETA_ROOT = "https://rt.data.gov.hk/v2/transport/nlb/stop.php?action=estimatedArrivals"

type Arrival = { estimatedArrivalTime?: string }

export function loadNlbPlaces(lng: number, lat: number, wide = false, zoom = Number.NaN): NlbPlacesResponse {
  const stops: NlbPlacesResponse["stops"] = []
  const radius = kmbReachMetres(zoom, lat)
  const found = wide ? nlbStopsSpread(lng, lat, radius, SOLO_CAP) : nlbStopsWithin(lng, lat, radius, STOP_CAP)
  for (const stop of found) {
    const record = nlbStop(stop.id)
    if (!record) continue
    stops.push({
      id: stop.id,
      nameTc: record.tc,
      nameEn: record.en,
      lng: record.lng,
      lat: record.lat,
      routes: record.routes,
    })
  }
  return { ok: true, stops: mergeSamePoles(stops) }
}

export async function loadNlbNear(lng: number, lat: number): Promise<NlbResponse> {
  const places = loadNlbPlaces(lng, lat)
  return {
    ok: places.ok,
    observedAt: null,
    stops: places.stops.map((stop) => ({ ...stop, calls: [], clock: "waiting" as const })),
    cacheable: true,
  }
}

export function loadNlbBoard(id: string, now = Date.now()): Promise<{ ok: true; stop: NlbStopBoard } | { ok: false }> {
  return loadPoleBoard(`nlb:${id}`, now, {
    poleIds: () => nlbPoleIds(id),
    pole: (stopId) => {
      const record = nlbStop(stopId)
      if (!record) return null
      return { tc: record.tc, en: record.en, lng: record.lng, lat: record.lat, routes: record.routes }
    },
    jobs: (stopId) => nlbStop(stopId)?.services ?? [],
    rows: (stopId, service) => fetchEta(service.id, stopId),
    calls: (_stopId, service, rows, at) => {
      const call = callAt(service.code, rows, at)
      return call ? [call] : []
    },
  })
}

function callAt(route: string, rows: Arrival[], now: number): NlbCall | null {
  let best: NlbCall | null = null
  for (const row of rows) {
    const etaMs = row.estimatedArrivalTime ? nlbArrivalMs(row.estimatedArrivalTime) : NaN
    if (!Number.isFinite(etaMs) || etaMs < now) continue
    const minutes = Math.max(0, Math.round((etaMs - now) / 60_000))
    if (best && (best.minutes ?? 999) <= minutes) continue
    best = { route, destTc: "", destEn: "", eta: new Date(etaMs).toISOString(), minutes, scheduled: false, remarkTc: "", remarkEn: "" }
  }
  if (best) return best
  if (rows.length === 0) return null
  return { route, destTc: "", destEn: "", eta: "", minutes: null, scheduled: false, remarkTc: "", remarkEn: "" }
}

async function fetchEta(routeId: string, stopId: string): Promise<Arrival[] | null> {
  const url = `${ETA_ROOT}&routeId=${encodeURIComponent(routeId)}&stopId=${encodeURIComponent(stopId)}&lang=en`
  const body = await readEtaJson<{ estimatedArrivals?: Arrival[] }>(url, {})
  if (!body) return null
  return Array.isArray(body.estimatedArrivals) ? body.estimatedArrivals : []
}
