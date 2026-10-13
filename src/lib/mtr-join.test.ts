import assert from "node:assert/strict"
import { linesFromCsv, mergeStationFix, venuesFromGeoJson } from "./mtr-join.ts"

const csv = [
  "Line Code,Direction,Station Code,Station ID,Chinese Name,English Name,Sequence",
  "ISL,DT,CEN,1,中環,Central,1",
  "ISL,DT,ADM,2,金鐘,Admiralty,2",
].join("\n")

const lines = linesFromCsv(csv)
assert.equal(lines.length, 2)

const central = venuesFromGeoJson({
  features: [{
    type: "Feature",
    properties: { venue_name_en: "Central Station", venue_name_zh: "中環站" },
    geometry: { type: "Polygon", coordinates: [[[114.157, 22.281], [114.159, 22.281], [114.159, 22.283], [114.157, 22.283], [114.157, 22.281]]] },
  }],
})
assert.equal(central.length, 1)

const current = {
  CEN: { en: "Central", tc: "中環", lng: 114.1, lat: 22.2 },
  ADM: { en: "Admiralty", tc: "金鐘", lng: 114.2, lat: 22.2 },
  OLD: { en: "Old", tc: "舊站", lng: 114.3, lat: 22.2 },
}

assert.equal(mergeStationFix(current, lines, central, 2), null)

const both = [
  ...central,
  {
    en: "Admiralty Station",
    tc: "金鐘站",
    lng: 114.164,
    lat: 22.279,
  },
]
const moved = mergeStationFix(current, lines, both, 2)
assert.ok(moved)
assert.equal(moved?.CEN.lng, 114.1578)
assert.equal(moved?.ADM.lng, 114.164)
assert.equal(moved?.OLD, undefined)

console.log("mtr-join")
