import { citybusPoleIds, citybusStop, citybusStopsSpread, citybusStopsWithin } from "@/lib/citybus-network"
import { kmbReachMetres, STOP_CAP } from "@/lib/kmb-reach"
import { readEtaJson } from "@/lib/eta-read"
import { nextBus } from "@/lib/next-bus"
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
  const groups = new Map<string, EtaRow[]>()
  for (const row of rows) {
    const route = text(row.route)
    if (!route) continue
    const key = `${route}\n${text(row.dest_tc)}\n${text(row.dest_en)}`
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }
  const calls: CitybusCall[] = []
  for (const group of groups.values()) {
    const head = group[0]
    if (!head) continue
    const picked = nextBus(group.map((row) => ({
      eta: row.eta,
      remarkTc: text(row.rmk_tc),
      remarkEn: text(row.rmk_en),
      scheduled: isScheduled(row),
    })), now)
    calls.push({
      route: text(head.route),
      destTc: text(head.dest_tc),
      destEn: text(head.dest_en),
      eta: picked.eta,
      minutes: picked.minutes,
      scheduled: picked.scheduled,
      remarkTc: picked.remarkTc,
      remarkEn: picked.remarkEn,
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
