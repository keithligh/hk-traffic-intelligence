import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { catalogueAccepts } from "./stop-list.ts"

assert.equal(catalogueAccepts(0, 6750), false)
assert.equal(catalogueAccepts(1, 6750), false)
assert.equal(catalogueAccepts(6075, 6750), true)
assert.equal(catalogueAccepts(6074, 6750), false)

type Stop = { tc: string; en: string; lng: number; lat: number }
const kmb = JSON.parse(readFileSync(new URL("../../data/kmb-network.json", import.meta.url), "utf8")) as { stops: Record<string, Stop> }
const citybus = JSON.parse(readFileSync(new URL("../../data/citybus-network.json", import.meta.url), "utf8")) as { stops: Record<string, Stop & { routes: string[] }> }

function within(stops: Record<string, Stop>, lng: number, lat: number, radius: number, limit: number): Stop[] {
  const cos = Math.cos((lat * Math.PI) / 180)
  return Object.values(stops)
    .map((stop) => {
      const east = (stop.lng - lng) * cos * 111_320
      const north = (stop.lat - lat) * 110_540
      return { stop, distance: Math.hypot(east, north) }
    })
    .filter((item) => item.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((item) => item.stop)
}

const nearHotel = within(kmb.stops, 114.196, 22.383, 650, 40)
const names = nearHotel.map((stop) => stop.tc)
assert.equal(nearHotel.length, 40)
assert.ok(names.some((name) => name.includes("麗豪酒店")))
assert.ok(names.some((name) => name.includes("河畔花園") || name.includes("富豪花園")))

const cityNear = within(citybus.stops, 114.196, 22.383, 2000, 6)
assert.ok(cityNear.length > 0)
for (const stop of cityNear) assert.ok(Array.isArray(stop.routes))
for (const id of ["003218", "003939", "003973", "003974", "003975", "003976", "003977", "004004"]) {
  assert.ok(citybus.stops[id], id)
  assert.ok(citybus.stops[id].routes.length > 0)
}
