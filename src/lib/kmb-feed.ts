import { busCompany } from "@/lib/bus-company"
import { refreshKmbCatalogue } from "@/lib/kmb-catalogue"
import { kmbPoleIds, kmbStop, kmbStopsSpread, kmbStopsWithin } from "@/lib/kmb-network"
import { kmbRoutesAt, refreshKmbRoutes } from "@/lib/kmb-routes"
import { mergeSamePoles } from "@/lib/kmb-pole"
import { KMB_LIST_BUDGET_MS, withinBudget } from "@/lib/list-wait"
import { kmbReachMetres, STOP_CAP } from "@/lib/kmb-reach"
import { nextBus } from "@/lib/next-bus"
import { readEtaJson } from "@/lib/eta-read"
import { loadPoleBoard } from "@/lib/pole-board"
import type { KmbCall, KmbPlacesResponse, KmbResponse, KmbStopBoard } from "@/lib/types"

const ETA_ROOT = "https://data.etabus.gov.hk/v1/transport/kmb/stop-eta"
// More than the mixed 40. The full stop list is what stalled the phone.
const SOLO_CAP = 160

type EtaRow = {
  co?: string
  route?: string
  dest_tc?: string
  dest_en?: string
  eta?: string | null
  eta_seq?: number
  rmk_en?: string
  rmk_tc?: string
}

export async function loadKmbPlaces(
  lng: number,
  lat: number,
  now = Date.now(),
  zoom = Number.NaN,
  wide = false,
  budgetMs = KMB_LIST_BUDGET_MS,
): Promise<KmbPlacesResponse> {
  const refresh = Promise.all([refreshKmbCatalogue(now), refreshKmbRoutes(now)])
  const listReady = await withinBudget(refresh, budgetMs)
  return { ...kmbPlacesAt(lng, lat, zoom, wide), listReady }
}

export function kmbPlacesAt(lng: number, lat: number, zoom = Number.NaN, wide = false): KmbPlacesResponse {
  const stops: KmbPlacesResponse["stops"] = []
  const radius = kmbReachMetres(zoom, lat)
  const found = wide ? kmbStopsSpread(lng, lat, radius, SOLO_CAP) : kmbStopsWithin(lng, lat, radius, STOP_CAP)
  for (const stop of found) {
    const record = kmbStop(stop.id)
    if (!record) continue
    stops.push({
      id: stop.id,
      nameTc: record.tc,
      nameEn: record.en,
      lng: record.lng,
      lat: record.lat,
      routes: kmbRoutesAt(stop.id),
    })
  }
  return { ok: true, stops: mergeSamePoles(stops) }
}

export async function loadKmbNear(lng: number, lat: number, now = Date.now(), zoom = Number.NaN): Promise<KmbResponse> {
  const places = await loadKmbPlaces(lng, lat, now, zoom)
  return {
    ok: places.ok,
    observedAt: null,
    stops: places.stops.map((stop) => ({ ...stop, calls: [], clock: "waiting" as const })),
    cacheable: true,
  }
}

export async function loadKmbBoard(id: string, now = Date.now()): Promise<{ ok: true; stop: KmbStopBoard } | { ok: false }> {
  const refresh = Promise.all([refreshKmbCatalogue(now), refreshKmbRoutes(now)])
  if (!kmbStop(id)) await withinBudget(refresh, KMB_LIST_BUDGET_MS)
  return loadPoleBoard(`kmb:${id}`, now, {
    poleIds: () => kmbPoleIds(id),
    pole: (stopId) => {
      const record = kmbStop(stopId)
      if (!record) return null
      return { tc: record.tc, en: record.en, lng: record.lng, lat: record.lat, routes: kmbRoutesAt(stopId) }
    },
    jobs: (stopId) => [stopId],
    rows: (stopId) => fetchStop(stopId),
    calls: (_stopId, _job, rows, at) => callsAt(rows, at),
  })
}

function callsAt(rows: EtaRow[], now: number): KmbCall[] {
  const groups = new Map<string, EtaRow[]>()
  for (const row of rows) {
    const route = text(row.route)
    if (!route) continue
    const key = `${route}\n${text(row.dest_tc)}\n${text(row.dest_en)}`
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }
  const calls: KmbCall[] = []
  for (const group of groups.values()) {
    const head = group[0]
    if (!head) continue
    const picked = nextBus(group.map((row) => ({
      eta: row.eta,
      remarkTc: text(row.rmk_tc),
      remarkEn: text(row.rmk_en),
      scheduled: isScheduled(row),
    })), now)
    const source = picked.index >= 0 ? group[picked.index] ?? head : head
    calls.push({
      route: text(head.route),
      destTc: text(head.dest_tc),
      destEn: text(head.dest_en),
      eta: picked.eta,
      minutes: picked.minutes,
      scheduled: picked.scheduled,
      remarkTc: picked.remarkTc,
      remarkEn: picked.remarkEn,
      company: busCompany(text(head.route), text(source.co)),
    })
  }
  calls.sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999) || a.route.localeCompare(b.route))
  return calls
}

function isScheduled(row: EtaRow): boolean {
  return row.rmk_en === "Scheduled Bus" || row.rmk_tc === "原定班次"
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

async function fetchStop(stopId: string): Promise<EtaRow[] | null> {
  const body = await readEtaJson<{ data?: EtaRow[] }>(`${ETA_ROOT}/${encodeURIComponent(stopId)}`)
  if (!body) return null
  return Array.isArray(body.data) ? body.data : []
}
