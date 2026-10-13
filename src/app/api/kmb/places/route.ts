import { loadKmbPlaces } from "@/lib/kmb-feed"
import type { KmbPlacesResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

const empty = (error: string): KmbPlacesResponse => ({ ok: false, error, stops: [] })

export async function GET(request: Request) {
  const url = new URL(request.url)
  const wide = url.searchParams.get("wide") === "1"
  const lng = Number(url.searchParams.get("lng"))
  const lat = Number(url.searchParams.get("lat"))
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return Response.json(empty("KMB centre missing"), { status: 400 })
  }
  const zoom = Number(url.searchParams.get("zoom"))
  try {
    return Response.json(await loadKmbPlaces(lng, lat, Date.now(), zoom, wide))
  } catch (error) {
    return Response.json(empty(error instanceof Error ? error.message : "KMB stops failed"), { status: 502 })
  }
}
