import { busCompany } from "@/lib/bus-company"
import { kmbCatalogueReady, refreshKmbCatalogue } from "@/lib/kmb-catalogue"
import { kmbPoleIds, kmbStop, kmbStopsSpread, kmbStopsWithin } from "@/lib/kmb-network"
import { kmbHeadingsAt, kmbRoutesAt, kmbRoutesReady, kmbVariant, kmbVariantsAt, kmbVariantsFor, refreshKmbRoutes } from "@/lib/kmb-routes"
import { mergeSamePoles } from "@/lib/kmb-pole"
import { KMB_LIST_BUDGET_MS, withinBudget } from "@/lib/list-wait"
import { kmbReachMetres, STOP_CAP } from "@/lib/kmb-reach"
import { MESSAGES } from "@/lib/i18n"
import { nextBus } from "@/lib/next-bus"
import { serviceKey, stopSetDifference, usualVariant, variantNote } from "@/lib/route-variant"
import { readEtaJson } from "@/lib/eta-read"
import { loadPoleBoard } from "@/lib/pole-board"
import type { KmbCall, KmbPlacesResponse, KmbResponse, KmbStopBoard } from "@/lib/types"

const ETA_ROOT = "https://data.etabus.gov.hk/v1/transport/kmb/stop-eta"
// More than the mixed 40. The full stop list is what stalled the phone.
const SOLO_CAP = 160

type EtaRow = {
  co?: string
  route?: string
  dir?: string
  service_type?: string | number
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
): Promise<KmbPlacesResponse> {
  refreshKmbCatalogue(now)
  refreshKmbRoutes(now)
  return { ...kmbPlacesAt(lng, lat, zoom, wide), listReady: kmbCatalogueReady(now) && kmbRoutesReady(now) }
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
      headings: kmbHeadingsAt(stop.id),
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
  refreshKmbCatalogue(now)
  refreshKmbRoutes(now)
  if (!kmbStop(id)) {
    await withinBudget(Promise.all([refreshKmbCatalogue(now), refreshKmbRoutes(now)]), KMB_LIST_BUDGET_MS)
  }
  return loadPoleBoard(`kmb:${id}`, now, {
    poleIds: () => kmbPoleIds(id),
    pole: (stopId) => {
      const record = kmbStop(stopId)
      if (!record) return null
      return { tc: record.tc, en: record.en, lng: record.lng, lat: record.lat, routes: kmbRoutesAt(stopId) }
    },
    jobs: (stopId) => [stopId],
    rows: (stopId) => fetchStop(stopId),
    calls: (stopId, _job, rows, at) => callsAt(stopId, rows, at),
  })
}

export async function kmbRouteCalls(stopId: string, routes: readonly string[], now = Date.now()): Promise<KmbCall[]> {
  const wanted = new Set(routes)
  const rows = await fetchStop(stopId)
  if (!rows) return []
  return callsAt(stopId, rows, now).filter((call) => wanted.has(call.route))
}

function callsAt(stopId: string, rows: EtaRow[], now: number): KmbCall[] {
  const groups = new Map<string, EtaRow[]>()
  for (const row of rows) {
    const route = text(row.route)
    if (!route) continue
    const service = serviceText(row.service_type) || "1"
    const bound = text(row.dir).toUpperCase()
    const key = `${route}\n${bound}\n${service}\n${text(row.dest_tc)}\n${text(row.dest_en)}`
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }
  const calls: KmbCall[] = []
  const seen = new Set<string>()
  for (const group of groups.values()) {
    const head = group[0]
    if (!head) continue
    const route = text(head.route)
    const service = serviceText(head.service_type) || "1"
    const bound = text(head.dir).toUpperCase()
    const picked = nextBus(group.map((row) => ({
      eta: row.eta,
      remarkTc: text(row.rmk_tc),
      remarkEn: text(row.rmk_en),
      scheduled: isScheduled(row),
    })), now)
    const source = picked.index >= 0 ? group[picked.index] ?? head : head
    const variant = variantLine(route, bound, service)
    markSeen(seen, route, bound, service)
    calls.push({
      route,
      destTc: text(head.dest_tc),
      destEn: text(head.dest_en),
      eta: picked.eta,
      minutes: picked.minutes,
      scheduled: picked.scheduled,
      remarkTc: joinRemark(picked.remarkTc, variant.tc),
      remarkEn: joinRemark(picked.remarkEn, variant.en),
      company: busCompany(route, text(source.co)),
    })
  }
  const routesWithCall = new Set(calls.map((call) => call.route))
  for (const variant of kmbVariantsAt(stopId)) {
    if (seen.has(variant.key) || !routesWithCall.has(variant.route)) continue
    const line = variantLine(variant.route, variant.bound, variant.service)
    calls.push({
      route: variant.route,
      destTc: variant.destTc,
      destEn: variant.destEn,
      eta: "",
      minutes: null,
      scheduled: false,
      remarkTc: line.tc,
      remarkEn: line.en,
      company: busCompany(variant.route, "KMB"),
    })
  }
  calls.sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999) || a.route.localeCompare(b.route, undefined, { numeric: true }))
  return calls
}

function markSeen(seen: Set<string>, route: string, bound: string, service: string) {
  if (bound) {
    seen.add(serviceKey(route, bound, service))
    return
  }
  for (const variant of kmbVariantsFor(route)) {
    if (variant.service === service) seen.add(variant.key)
  }
}

function variantLine(route: string, bound: string, service: string): { tc: string; en: string } {
  const current = bound ? kmbVariant(route, bound, service) : kmbVariantsFor(route).find((item) => item.service === service) ?? null
  const family = kmbVariantsFor(route).filter((item) => !bound || item.bound === bound)
  const usual = usualVariant(family)
  const special = usual ? service !== usual.service : service !== "1"
  if (!current || !usual || current.key === usual.key) {
    if (!special) return { tc: "", en: "" }
    return { tc: variantNote(MESSAGES["zh-HK"], true, [], []), en: variantNote(MESSAGES.en, true, [], []) }
  }
  const gap = stopSetDifference(usual.stops, current.stops)
  const skipTc = gap.skip.map((id) => placeName(id, "tc")).filter(Boolean)
  const skipEn = gap.skip.map((id) => placeName(id, "en")).filter(Boolean)
  const addTc = gap.add.map((id) => placeName(id, "tc")).filter(Boolean)
  const addEn = gap.add.map((id) => placeName(id, "en")).filter(Boolean)
  return {
    tc: variantNote(MESSAGES["zh-HK"], special, skipTc, addTc),
    en: variantNote(MESSAGES.en, special, skipEn, addEn),
  }
}

function placeName(id: string, field: "tc" | "en"): string {
  const stop = kmbStop(id)
  if (!stop) return ""
  return stop[field].replace(/\s*\([^)]*\)\s*$/, "").trim()
}

function joinRemark(remark: string, variant: string): string {
  return [remark, variant].filter(Boolean).join(" ")
}

function serviceText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return text(value)
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
