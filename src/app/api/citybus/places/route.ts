import { loadCitybusPlaces } from "@/lib/citybus-feed"
import { refreshCitybusStops } from "@/lib/citybus-catalogue"
import type { CitybusPlacesResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

const empty = (error: string): CitybusPlacesResponse => ({ ok: false, error, stops: [] })

export async function GET(request: Request) {
  const url = new URL(request.url)
  const wide = url.searchParams.get("wide") === "1"
  const lng = Number(url.searchParams.get("lng"))
  const lat = Number(url.searchParams.get("lat"))
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return Response.json(empty("Citybus centre missing"), { status: 400 })
  }
  const zoom = Number(url.searchParams.get("zoom"))
  try {
    const cycle = await refreshCitybusStops()
    return Response.json({ ...loadCitybusPlaces(lng, lat, wide, zoom), listReady: cycle.listReady, refreshing: cycle.refreshing })
  } catch (error) {
    return Response.json(empty(error instanceof Error ? error.message : "Citybus stops failed"), { status: 502 })
  }
}
