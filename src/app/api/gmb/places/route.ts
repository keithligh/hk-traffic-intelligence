import { refreshGmbStops } from "@/lib/gmb-catalogue"
import { loadGmbPlaces } from "@/lib/gmb-feed"
import type { GmbPlacesResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

const empty = (error: string): GmbPlacesResponse => ({ ok: false, error, stops: [] })

export async function GET(request: Request) {
  const url = new URL(request.url)
  const wide = url.searchParams.get("wide") === "1"
  const lng = Number(url.searchParams.get("lng"))
  const lat = Number(url.searchParams.get("lat"))
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return Response.json(empty("Green minibus centre missing"), { status: 400 })
  }
  const zoom = Number(url.searchParams.get("zoom"))
  try {
    const cycle = await refreshGmbStops()
    return Response.json({ ...loadGmbPlaces(lng, lat, Date.now(), zoom, wide), listReady: cycle.listReady, refreshing: cycle.refreshing })
  } catch (error) {
    return Response.json(empty(error instanceof Error ? error.message : "Green minibus stops failed"), { status: 502 })
  }
}
