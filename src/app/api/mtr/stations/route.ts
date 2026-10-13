import { KMB_LIST_BUDGET_MS, withinBudget } from "@/lib/list-wait"
import { refreshMtrStations } from "@/lib/mtr-catalogue"
import { mtrNamedStations } from "@/lib/mtr-network"

export const dynamic = "force-dynamic"

export async function GET() {
  const listReady = await withinBudget(refreshMtrStations(), KMB_LIST_BUDGET_MS)
  const stations = mtrNamedStations().map((station) => ({
    code: station.id,
    en: station.en,
    tc: station.tc,
    lng: station.lng,
    lat: station.lat,
  }))
  return Response.json({ ok: true, listReady, stations })
}
