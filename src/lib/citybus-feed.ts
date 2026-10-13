import { citybusPoleIds, citybusStop, citybusStopsSpread, citybusStopsWithin } from "@/lib/citybus-network"
import { kmbReachMetres, STOP_CAP } from "@/lib/kmb-reach"
import { readEtaJson } from "@/lib/eta-read"
import { loadPoleBoard } from "@/lib/pole-board"
import type { CitybusCall, CitybusPlacesResponse, CitybusResponse, CitybusStopBoard } from "@/lib/types"

const SOLO_CAP = 200
const ETA_ROOT = "https://rt.data.gov.hk/v2/transport/citybus/eta/CTB"

type EtaRow = {
  route?: string
  dest_tc?: string
  dest_en?: string
  eta?: string | null
  eta_seq?: number
  rmk_en?: string
  rmk_tc?: string
}

export function loadCitybusPlaces(lng: number, lat: number, wide = false, zoom = Number.NaN): CitybusPlacesResponse {
  const stops: CitybusPlacesResponse["stops"] = []
  const radius = kmbReachMetres(zoom, lat)
  const found = wide ? citybusStopsSpread(lng, lat, radius, SOLO_CAP) : citybusStopsWithin(lng, lat, radius, STOP_CAP)
  for (const stop of found) {
    const record = citybusStop(stop.id)
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
  return { ok: true, stops }
}

export async function loadCitybusNear(lng: number, lat: number): Promise<CitybusResponse> {
  const places = loadCitybusPlaces(lng, lat)
  return {
    ok: places.ok,
    observedAt: null,
    stops: places.stops.map((stop) => ({ ...stop, calls: [], clock: "waiting" as const })),
    cacheable: true,
  }
}

export function loadCitybusBoard(id: string, now = Date.now()): Promise<{ ok: true; stop: CitybusStopBoard } | { ok: false }> {
  return loadPoleBoard(`citybus:${id}`, now, {
    poleIds: () => citybusPoleIds(id),
    pole: (stopId) => {
      const record = citybusStop(stopId)
      if (!record) return null
      return { tc: record.tc, en: record.en, lng: record.lng, lat: record.lat, routes: record.routes }
    },
    jobs: (_stopId, record) => record.routes,
    rows: (stopId, route) => fetchEta(stopId, route),
    calls: (_stopId, _route, rows, at) => callsAt(rows, at),
  })
}

function callsAt(rows: EtaRow[], now: number): CitybusCall[] {
  const calls: CitybusCall[] = []
  for (const row of rows) {
    if (row.eta_seq !== 1) continue
    const route = text(row.route)
    if (!route) continue
    const etaMs = row.eta ? Date.parse(row.eta) : NaN
    const hasEta = Number.isFinite(etaMs)
    const remarkTc = isScheduled(row) ? "" : text(row.rmk_tc)
    const remarkEn = isScheduled(row) ? "" : text(row.rmk_en)
    calls.push({
      route,
      destTc: text(row.dest_tc),
      destEn: text(row.dest_en),
      eta: hasEta ? new Date(etaMs).toISOString() : "",
      minutes: hasEta ? Math.max(0, Math.round((etaMs - now) / 60_000)) : null,
      scheduled: isScheduled(row),
      remarkTc,
      remarkEn,
    })
  }
  calls.sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999) || a.route.localeCompare(b.route, undefined, { numeric: true }))
  return calls
}

function isScheduled(row: EtaRow): boolean {
  return row.rmk_en === "Scheduled Bus" || row.rmk_tc === "原定班次"
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

async function fetchEta(stopId: string, route: string): Promise<EtaRow[] | null> {
  const body = await readEtaJson<{ data?: EtaRow[] }>(`${ETA_ROOT}/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}`)
  if (!body) return null
  return Array.isArray(body.data) ? body.data : []
}
