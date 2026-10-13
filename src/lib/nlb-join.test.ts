import assert from "node:assert/strict"
import { addNlbRouteStops, nlbStopRecord } from "./nlb-join.ts"

const stops = new Map()
addNlbRouteStops(stops, "1", "1", [
  { stopId: "10", longitude: "113.94", latitude: "22.28", stopName_c: "梅窩", stopName_e: "Mui Wo" },
])
addNlbRouteStops(stops, "2", "2", [
  { stopId: "10", longitude: "113.94", latitude: "22.28", stopName_c: "梅窩", stopName_e: "Mui Wo" },
  { stopId: "bad", longitude: "", latitude: "22", stopName_c: "缺", stopName_e: "Missing" },
])
const record = nlbStopRecord(stops)
assert.deepEqual(record["10"]?.routes, ["1", "2"])
assert.deepEqual(record["10"]?.services.map((service) => service.id), ["1", "2"])
assert.equal(record.bad, undefined)

console.log("nlb-join")
