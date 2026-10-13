import { gmbDestination } from "@/lib/gmb-destinations"
import { mergeSamePoles } from "@/lib/kmb-pole"
import { gmbPoleIds, gmbStop, gmbStopsSpread, gmbStopsWithin } from "@/lib/gmb-reach"
import { kmbReachMetres } from "@/lib/kmb-reach"
import { readEtaJson } from "@/lib/eta-read"
import { loadPoleBoard } from "@/lib/pole-board"
import type { GmbCall, GmbPlacesResponse, GmbResponse, GmbStopBoard } from "@/lib/types"

const GMB_CAP = 24
// More than the nearest 24. The green-minibus catalogue is thousands of stops.
const SOLO_CAP = 160
const ETA_ROOT = "https://data.etagmb.gov.hk/eta/stop"

type EtaEntry = {
  eta_seq?: number
  diff?: number
  timestamp?: string
  remarks_tc?: string | null
  remarks_en?: string | null
}

type EtaRoute = {
  route_id?: number
  route_seq?: number
  enabled?: boolean
  eta?: EtaEntry[] | null
}

export function loadGmbPlaces(lng: number, lat: number, _now = Date.now(), zoom = Number.NaN, wide = false): GmbPlacesResponse {
  const stops: GmbPlacesResponse["stops"] = []
  const radius = kmbReachMetres(zoom, lat)
  const found = wide ? gmbStopsSpread(lng, lat, radius, SOLO_CAP) : gmbStopsWithin(lng, lat, radius, GMB_CAP)
  for (const stop of found) {
    const record = gmbStop(stop.id)
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

export async function loadGmbNear(lng: number, lat: number, now = Date.now(), zoom = Number.NaN): Promise<GmbResponse> {
  const places = loadGmbPlaces(lng, lat, now, zoom)
  return {
    ok: places.ok,
    observedAt: null,
    stops: places.stops.map((stop) => ({ ...stop, calls: [], clock: "waiting" as const })),
    cacheable: true,
  }
}

export function loadGmbBoard(id: string, now = Date.now()): Promise<{ ok: true; stop: GmbStopBoard } | { ok: false }> {
  return loadPoleBoard(`gmb:${id}`, now, {
    poleIds: () => gmbPoleIds(id),
    pole: (stopId) => {
      const record = gmbStop(stopId)
      if (!record) return null
      return { tc: record.tc, en: record.en, lng: record.lng, lat: record.lat, routes: record.routes }
    },
    jobs: (stopId) => [stopId],
    rows: (stopId) => fetchStop(stopId),
    calls: (stopId, _job, rows, at) => callsAt(rows, gmbStop(stopId)?.ids ?? {}, at),
  })
}

function callsAt(rows: EtaRoute[], ids: Record<string, string>, now: number): GmbCall[] {
  const soonest = new Map<string, GmbCall>()
  for (const row of rows) {
    if (row.enabled === false || row.route_id == null) continue
    const route = ids[String(row.route_id)]
    if (!route) continue
    const dest = gmbDestination(row.route_id, row.route_seq ?? 0)
    const upcoming = (row.eta ?? [])
      .map((item) => ({ item, etaMs: item.timestamp ? Date.parse(item.timestamp) : Number.NaN }))
      .filter((item) => Number.isFinite(item.etaMs) && item.etaMs >= now)
      .sort((a, b) => a.etaMs - b.etaMs)[0]
    const entry = upcoming?.item ?? (row.eta ?? []).find((item) => item.eta_seq === 1) ?? row.eta?.[0]
    const etaMs = upcoming?.etaMs ?? Number.NaN
    const hasEta = upcoming != null
    const minutes = hasEta ? Math.max(0, Math.round((etaMs - now) / 60_000)) : null
    if (!entry && !dest) continue
    if (entry && !hasEta && minutes == null && !dest && !text(entry.remarks_tc) && !text(entry.remarks_en)) continue
    const call: GmbCall = {
      route,
      destTc: dest?.tc ?? "",
      destEn: dest?.en ?? "",
      eta: hasEta ? new Date(etaMs).toISOString() : "",
      minutes,
      scheduled: false,
      remarkTc: text(entry?.remarks_tc),
      remarkEn: text(entry?.remarks_en),
    }
    const current = soonest.get(String(row.route_id))
    if (!current || (call.minutes ?? 999) < (current.minutes ?? 999)) soonest.set(String(row.route_id), call)
  }
  return [...soonest.values()].sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999) || a.route.localeCompare(b.route, undefined, { numeric: true }))
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

async function fetchStop(stopId: string): Promise<EtaRoute[] | null> {
  const body = await readEtaJson<{ data?: EtaRoute[] }>(`${ETA_ROOT}/${encodeURIComponent(stopId)}`)
  if (!body) return null
  return Array.isArray(body.data) ? body.data : []
}
