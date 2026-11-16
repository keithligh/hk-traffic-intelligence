import bundled from "../../data/joint-routes.json" with { type: "json" }
import { groundMetres } from "./nearest.ts"

const jointRoutes = new Set(bundled as string[])

export function isJointRoute(route: string): boolean {
  return jointRoutes.has(route)
}

export function jointRouteSet(): ReadonlySet<string> {
  return jointRoutes
}

export type RouteEnds = { route: string; origTc: string; destTc: string }

const PLACE_MARK = /站|邨/g

export function placesMatch(a: string, b: string): boolean {
  const left = bare(a)
  const right = bare(b)
  if (left.length < 2 || right.length < 2) return false
  return left === right || left.includes(right) || right.includes(left)
}

export function jointRouteNumbers(kmb: readonly RouteEnds[], citybus: readonly RouteEnds[]): string[] {
  const other = new Map<string, RouteEnds[]>()
  for (const row of citybus) {
    const list = other.get(row.route) ?? []
    list.push(row)
    other.set(row.route, list)
  }
  const found = new Set<string>()
  for (const row of kmb) {
    const candidates = other.get(row.route)
    if (!candidates) continue
    if (candidates.some((item) => sameEnds(row, item))) found.add(row.route)
  }
  return [...found].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

export function jointPartner(
  routes: readonly string[],
  here: { lng: number; lat: number },
  candidates: readonly { id: string; lng: number; lat: number; routes: readonly string[] }[],
  joint: ReadonlySet<string>,
  metres: number,
): { id: string; routes: string[] } | null {
  let best: { id: string; routes: string[] } | null = null
  for (const candidate of candidates) {
    if (groundMetres(here.lng, here.lat, candidate.lng, candidate.lat) > metres) continue
    const shared = routes.filter((route) => joint.has(route) && candidate.routes.includes(route))
    if (shared.length === 0) continue
    if (!best || shared.length > best.routes.length) best = { id: candidate.id, routes: shared }
  }
  return best
}

function sameEnds(left: RouteEnds, right: RouteEnds): boolean {
  return (placesMatch(left.destTc, right.destTc) && placesMatch(left.origTc, right.origTc))
    || (placesMatch(left.destTc, right.origTc) && placesMatch(left.origTc, right.destTc))
}

function bare(value: string): string {
  return value.replace(/\s+/g, "").replace(/[()（）]/g, "").replace(PLACE_MARK, "")
}
