import assert from "node:assert/strict"
import { gmbRecords, routeCodes, routeDirections, routeStops, stopPoint, type GmbMember } from "./gmb-join.ts"

const listed = routeCodes({ data: { routes: ["1", "10", "1", 28] } })
assert.deepEqual(listed, ["1", "10", "28"])

const directions = routeDirections(
  {
    data: [
      {
        route_id: 2006408,
        route_code: "1",
        directions: [{ route_seq: 1 }, { route_seq: 2 }],
      },
    ],
  },
  "1",
)
assert.deepEqual(directions, [
  { routeId: "2006408", seq: 1, code: "1" },
  { routeId: "2006408", seq: 2, code: "1" },
])
assert.deepEqual(routeDirections({ data: [] }, "1"), [])
assert.equal(routeDirections({}, "1"), null)

const rows = routeStops({
  data: { route_stops: [{ stop_id: 20014489, name_tc: "山頂廣場", name_en: "The Peak Galleria" }] },
})
assert.deepEqual(rows, [{ id: "20014489", tc: "山頂廣場", en: "The Peak Galleria" }])
assert.deepEqual(routeStops({ data: { route_stops: [] } }), [])
assert.equal(routeStops({ data: {} }), null)

assert.equal(stopPoint({ data: { enabled: false } }), "disabled")
assert.deepEqual(stopPoint({ data: { enabled: true, coordinates: { wgs84: { longitude: 114.15, latitude: 22.27 } } } }), {
  lng: 114.15,
  lat: 22.27,
})
assert.equal(stopPoint({ data: { enabled: true, coordinates: { wgs84: { longitude: 0, latitude: 0 } } } }), null)

const bundled = {
  a: { tc: "甲", en: "A", lng: 114.1, lat: 22.2, routes: ["1"], ids: { "9": "1" } },
  b: { tc: "乙", en: "B", lng: 114.2, lat: 22.2, routes: ["1"], ids: { "9": "1" } },
}
const members = new Map<string, GmbMember>([
  ["a", { tc: "甲", en: "A", routes: ["1", "10"], ids: { "9": "1", "8": "10" } }],
  ["c", { tc: "丙", en: "C", routes: ["2"], ids: { "7": "2" } }],
])
assert.equal(gmbRecords(members, bundled, {}, 1), null)
const ready = gmbRecords(members, bundled, { c: { lng: 114.3, lat: 22.3 } }, 1)
assert.equal(ready?.b, undefined)
assert.equal(ready?.c.lng, 114.3)
assert.deepEqual(ready?.a.routes, ["1", "10"])
assert.deepEqual(ready?.a.ids, { "9": "1", "8": "10" })
assert.equal(ready?.a.lng, 114.1)
assert.equal(gmbRecords(members, bundled, { c: { lng: 114.3, lat: 22.3 } }, 3), null)

console.log("gmb-join")
