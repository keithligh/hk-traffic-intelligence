import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { readRouteBook, readRouteStopList, readStopHeadings, routeHeading, routesWithoutArrival } from "./stop-routes.ts"

assert.deepEqual(routesWithoutArrival(["79", "982C", "B8"], []), ["79", "982C", "B8"])
assert.deepEqual(routesWithoutArrival(["79", "982C", "B8"], ["79"]), ["982C", "B8"])
assert.deepEqual(routesWithoutArrival(["79", "79", " B8 "], []), ["79", "B8"])
assert.deepEqual(routesWithoutArrival(["79"], ["79"]), [])
assert.deepEqual(routesWithoutArrival([], []), [])

const parsed = readRouteStopList({
  data: [
    { route: "35A", stop: "YT119" },
    { route: "234X", stop: "YT119" },
    { route: "35A", stop: "YT119" },
    { route: "1", stop: "OTHER" },
    { route: "", stop: "YT119" },
  ],
}, 2)
assert.deepEqual(parsed, { YT119: ["35A", "234X"], OTHER: ["1"] })
assert.equal(readRouteStopList({ data: [{ route: "1", stop: "A" }] }, 2), null)

const published = JSON.parse(readFileSync(new URL("../../data/kmb-routes.json", import.meta.url), "utf8")) as {
  stops: Record<string, string[]>
}
assert.deepEqual(published.stops.B0F64FFFBECE8AA4, ["35A", "35X", "36X", "37X", "41A", "234X", "242X"])

const book = readRouteBook({
  data: [
    { route: "A41", bound: "O", service_type: 1, dest_tc: "機場(地面運輸中心)", dest_en: "AIRPORT (GROUND TRANSPORTATION CENTRE)" },
    { route: "A41", bound: "I", service_type: "1", dest_tc: "碩門邨", dest_en: "SHEK MUN ESTATE" },
  ],
})
if (!book) throw new Error("book")
assert.deepEqual(routeHeading(book, "A41", "I", "1"), { destTc: "碩門邨", destEn: "SHEK MUN ESTATE" })
assert.deepEqual(routeHeading(book, "A41", "O", "9"), { destTc: "機場(地面運輸中心)", destEn: "AIRPORT (GROUND TRANSPORTATION CENTRE)" })
const headings = readStopHeadings({
  data: [
    { route: "A41", bound: "I", service_type: 1, stop: "CL915" },
    { route: "A41", bound: "O", service_type: 1, stop: "CL900" },
    { route: "A41", bound: "I", service_type: 1, stop: "CL915" },
  ],
}, book)
assert.deepEqual(headings, {
  CL915: [{ route: "A41", destTc: "碩門邨", destEn: "SHEK MUN ESTATE" }],
  CL900: [{ route: "A41", destTc: "機場(地面運輸中心)", destEn: "AIRPORT (GROUND TRANSPORTATION CENTRE)" }],
})
