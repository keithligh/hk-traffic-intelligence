import { KMB_LIST_BUDGET_MS, withinBudget } from "@/lib/list-wait"
import { loadNlbPlaces } from "@/lib/nlb-feed"
import { refreshNlbStops } from "@/lib/nlb-catalogue"
import type { NlbPlacesResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

const empty = (error: string): NlbPlacesResponse => ({ ok: false, error, stops: [] })

export async function GET(request: Request) {
  const url = new URL(request.url)
  const wide = url.searchParams.get("wide") === "1"
  const lng = Number(url.searchParams.get("lng"))
  const lat = Number(url.searchParams.get("lat"))
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return Response.json(empty("New Lantao Bus centre missing"), { status: 400 })
  }
  const zoom = Number(url.searchParams.get("zoom"))
  try {
    const listReady = await withinBudget(refreshNlbStops(), KMB_LIST_BUDGET_MS)
    return Response.json({ ...loadNlbPlaces(lng, lat, wide, zoom), listReady })
  } catch (error) {
    return Response.json(empty(error instanceof Error ? error.message : "New Lantao Bus stops failed"), { status: 502 })
  }
}
