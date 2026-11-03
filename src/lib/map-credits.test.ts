import assert from "node:assert/strict"
import { dataCreditOpen, MAP_CREDIT, shownCredits } from "./map-credits.ts"

const OPENFREEMAP =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'

const satellite = [
  MAP_CREDIT.esri,
  MAP_CREDIT.transport,
  MAP_CREDIT.transport,
  MAP_CREDIT.immigration,
  MAP_CREDIT.mtr,
  MAP_CREDIT.osm,
  MAP_CREDIT.mtr,
  MAP_CREDIT.lands,
  MAP_CREDIT.osm,
  MAP_CREDIT.kmb,
  MAP_CREDIT.citybus,
  MAP_CREDIT.nlb,
  MAP_CREDIT.ferries,
]

const line = shownCredits(satellite).join(" | ")
assert.equal(line.split("OpenStreetMap").length - 1, 1)
assert.equal(line.split("MTR").length - 1, 1)
assert.equal(line.includes("MTR Corporation"), false)
assert.equal(line.split("Lands Department").length - 1, 1)
assert.equal(line.split("KMB").length - 1, 1)
assert.equal(line.includes("© LWB"), true)
assert.equal(line.includes("Long Win"), false)
assert.equal(line.includes("© Citybus"), true)
assert.equal(line.includes("© NLB"), true)
assert.equal(line.includes("New Lantao Bus"), false)
assert.equal(line.includes("© Sun Ferry"), true)
assert.equal(line.includes("© HKKF"), true)
assert.equal(line.includes("Hong Kong and Kowloon Ferry"), false)
assert.equal(line.includes("© Star Ferry"), true)
assert.equal(line.includes("© Fortune Ferry"), true)

const street = shownCredits([OPENFREEMAP, ...satellite.filter((credit) => credit !== MAP_CREDIT.esri)]).join(" | ")
assert.equal(street.split("OpenStreetMap").length - 1, 1)
assert.equal(street.includes("OpenFreeMap"), true)
assert.equal(OPENFREEMAP.includes(MAP_CREDIT.osm), true)

assert.equal(dataCreditOpen(true, null), false)
assert.equal(dataCreditOpen(true, true), true)
assert.equal(dataCreditOpen(true, false), false)
assert.equal(dataCreditOpen(false, null), true)
assert.equal(dataCreditOpen(false, false), false)
assert.equal(dataCreditOpen(false, true), true)

console.log("map credits ok")
