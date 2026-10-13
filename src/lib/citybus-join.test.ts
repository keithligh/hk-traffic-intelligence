import assert from "node:assert/strict"
import { citybusRecords } from "./citybus-join.ts"

const bundled = {
  a: { tc: "甲", en: "A", lng: 114.1, lat: 22.2, routes: ["1"] },
  b: { tc: "乙", en: "B", lng: 114.2, lat: 22.2, routes: ["1"] },
}
const members = new Map<string, string[]>([
  ["a", ["1"]],
  ["c", ["2"]],
])
assert.equal(citybusRecords(members, bundled, {}, 1), null)
const ready = citybusRecords(members, bundled, { c: { tc: "丙", en: "C", lng: 114.3, lat: 22.3 } }, 1)
assert.equal(ready?.b, undefined)
assert.equal(ready?.c.lng, 114.3)
assert.deepEqual(ready?.a.routes, ["1"])
assert.equal(ready?.a.lng, 114.1)

console.log("citybus-join")
