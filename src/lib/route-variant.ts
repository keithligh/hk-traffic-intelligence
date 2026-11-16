import type { Messages } from "./i18n.ts"
import { routeHeading, type RouteHeading } from "./stop-routes.ts"

export type ServiceVariant = {
  key: string
  route: string
  bound: string
  service: string
  destTc: string
  destEn: string
  stops: string[]
}

export function serviceKey(route: string, bound: string, service: string): string {
  return `${route}\n${bound}\n${service}`
}

export function readServiceVariants(
  payload: unknown,
  book: ReadonlyMap<string, RouteHeading> | null,
): { variants: ServiceVariant[]; atStop: Record<string, string[]> } | null {
  if (typeof payload !== "object" || payload === null || !("data" in payload) || !Array.isArray(payload.data)) return null
  const grouped = new Map<string, { route: string; bound: string; service: string; rows: { seq: number; stop: string }[] }>()
  for (const item of payload.data) {
    if (typeof item !== "object" || item === null) continue
    const row = item as Record<string, unknown>
    const route = text(row.route)
    const bound = text(row.bound).toUpperCase()
    const service = serviceText(row.service_type)
    const stop = text(row.stop)
    if (!route || !bound || !service || !stop) continue
    const key = serviceKey(route, bound, service)
    const group = grouped.get(key) ?? { route, bound, service, rows: [] }
    group.rows.push({ seq: numberValue(row.seq), stop })
    grouped.set(key, group)
  }
  if (grouped.size === 0) return null
  const variants: ServiceVariant[] = []
  const atStop: Record<string, string[]> = {}
  for (const [key, group] of grouped) {
    group.rows.sort((a, b) => a.seq - b.seq)
    const stops: string[] = []
    const seen = new Set<string>()
    for (const row of group.rows) {
      if (seen.has(row.stop)) continue
      seen.add(row.stop)
      stops.push(row.stop)
    }
    const heading = book ? routeHeading(book, group.route, group.bound, group.service) : null
    variants.push({
      key,
      route: group.route,
      bound: group.bound,
      service: group.service,
      destTc: heading?.destTc ?? "",
      destEn: heading?.destEn ?? "",
      stops,
    })
    for (const stop of stops) {
      const list = atStop[stop] ?? []
      list.push(key)
      atStop[stop] = list
    }
  }
  for (const list of Object.values(atStop)) list.sort()
  return { variants, atStop }
}

export function stopSetDifference(base: readonly string[], other: readonly string[]): { skip: string[]; add: string[] } {
  const baseSet = new Set(base)
  const otherSet = new Set(other)
  return {
    skip: base.filter((id) => !otherSet.has(id)),
    add: other.filter((id) => !baseSet.has(id)),
  }
}

export function usualVariant(variants: readonly ServiceVariant[]): ServiceVariant | null {
  const typed = variants.find((item) => item.service === "1")
  if (typed) return typed
  return variants.slice().sort((a, b) => b.stops.length - a.stops.length)[0] ?? null
}

export function variantNote(m: Messages, special: boolean, skip: readonly string[], add: readonly string[]): string {
  const parts: string[] = []
  if (special) parts.push(m.specialDeparture)
  if (skip.length > 0) parts.push(m.skipsStops(nameList(skip, m)))
  if (add.length > 0) parts.push(m.addsStops(nameList(add, m)))
  return parts.join(m.locale === "en" ? ", " : "，")
}

function nameList(names: readonly string[], m: Messages): string {
  const shown = names.slice(0, 2)
  const extra = names.length - shown.length
  const head = shown.join(m.locale === "en" ? ", " : "、")
  if (extra <= 0) return head
  return m.moreStops(head, extra)
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function serviceText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return text(value)
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}
