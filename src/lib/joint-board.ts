import { citybusRouteCalls } from "@/lib/citybus-feed"
import { citybusStop, citybusStopsWithin } from "@/lib/citybus-network"
import { kmbRouteCalls } from "@/lib/kmb-feed"
import { kmbRoutesAt } from "@/lib/kmb-routes"
import { kmbStopsWithin } from "@/lib/kmb-network"
import { jointPartner, jointRouteSet } from "@/lib/joint-route"
import type { CitybusCall, CitybusStopBoard, KmbCall, KmbStopBoard } from "@/lib/types"

const JOINT_METRES = 80

export async function withJointKmb(stop: KmbStopBoard, now = Date.now()): Promise<KmbStopBoard> {
  const partner = jointPartner(stop.routes, stop, citybusCandidates(stop.lng, stop.lat), jointRouteSet(), JOINT_METRES)
  if (!partner) return stop
  const extra = await citybusRouteCalls(partner.id, partner.routes, now)
  return { ...stop, calls: mergeKmb(stop.routes, stop.calls, extra) }
}

export async function withJointCitybus(stop: CitybusStopBoard, now = Date.now()): Promise<CitybusStopBoard> {
  const partner = jointPartner(stop.routes, stop, kmbCandidates(stop.lng, stop.lat), jointRouteSet(), JOINT_METRES)
  if (!partner) return stop
  const extra = await kmbRouteCalls(partner.id, partner.routes, now)
  return { ...stop, calls: mergeCitybus(stop.routes, stop.calls, extra) }
}

function citybusCandidates(lng: number, lat: number) {
  return citybusStopsWithin(lng, lat, JOINT_METRES, 12).flatMap((point) => {
    const record = citybusStop(point.id)
    if (!record) return []
    return [{ id: point.id, lng: point.lng, lat: point.lat, routes: record.routes }]
  })
}

function kmbCandidates(lng: number, lat: number) {
  return kmbStopsWithin(lng, lat, JOINT_METRES, 12).map((point) => ({
    id: point.id,
    lng: point.lng,
    lat: point.lat,
    routes: kmbRoutesAt(point.id),
  }))
}

function mergeKmb(routes: readonly string[], native: KmbCall[], extra: CitybusCall[]): KmbCall[] {
  const owned = new Set(routes)
  const incoming = extra.filter((call) => owned.has(call.route))
  const incomingRoutes = new Set(incoming.map((call) => call.route))
  const left = native.map((call) => incomingRoutes.has(call.route) ? { ...call, paired: true } : call)
  const right: KmbCall[] = incoming.map((call) => ({
    route: call.route,
    destTc: call.destTc,
    destEn: call.destEn,
    eta: call.eta,
    minutes: call.minutes,
    scheduled: call.scheduled,
    remarkTc: call.remarkTc,
    remarkEn: call.remarkEn,
    company: "CTB",
    paired: true,
  }))
  return [...left, ...right].sort(byMinutes)
}

function mergeCitybus(routes: readonly string[], native: CitybusCall[], extra: KmbCall[]): CitybusCall[] {
  const owned = new Set(routes)
  const incoming = extra.filter((call) => owned.has(call.route))
  const incomingRoutes = new Set(incoming.map((call) => call.route))
  const left = native.map((call) => incomingRoutes.has(call.route) ? { ...call, company: "CTB" as const, paired: true } : call)
  const right: CitybusCall[] = incoming.map((call) => ({
    route: call.route,
    destTc: call.destTc,
    destEn: call.destEn,
    eta: call.eta,
    minutes: call.minutes,
    scheduled: call.scheduled,
    remarkTc: call.remarkTc,
    remarkEn: call.remarkEn,
    company: call.company,
    paired: true,
  }))
  return [...left, ...right].sort(byMinutes)
}

function byMinutes(a: { minutes: number | null; route: string }, b: { minutes: number | null; route: string }): number {
  return (a.minutes ?? 999) - (b.minutes ?? 999) || a.route.localeCompare(b.route, undefined, { numeric: true })
}
