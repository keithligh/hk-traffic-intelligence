import assert from "node:assert/strict"
import { meterClock, meterColorStops, meterFleet, meterFree, meterInk, meterMark, meterPin, meterPlateCount, meterPolesNear, meterPolesWide, meterReported, meterUnionsCovered, parseMeterPoles, parseMeterSites, METER_CAP, METER_WIDE_CAP, type MeterPole } from "./meter-poles.ts"

const spaces = `2026-10-04

PoleId,ParkingSpaceId,Street,Street_tc,SectionOfStreet,SectionOfStreet_tc,Latitude,Longitude,VehicleType
1,1B,Island Road,香島道,Golf Club,哥爾夫球會,22.2800,114.1500,G
1,1A,Island Road,香島道,Golf Club,哥爾夫球會,22.2800,114.1500,A
2,2A,Tai Po Road,大埔公路,Sha Tin,沙田,22.3800,114.1900,C
`
const occupancy = `ParkingSpaceId,ParkingMeterStatus,OccupancyStatus,OccupancyDateChanged
1A,N,V,10/05/2026 12:00:00 PM
1B,N,O,10/05/2026 12:04:00 PM
2A,NU,O,10/05/2026 12:00:00 PM
`
const poles = parseMeterPoles(spaces, occupancy)
assert.equal(poles.length, 2)
const island = poles.find((pole) => pole.id === "1")
assert.equal(island?.streetTc, "香島道")
assert.equal(island?.spaces.map((space) => space.id).join(","), "1A,1B")
assert.equal(island?.spaces[0]?.kind, "general")
assert.equal(island?.spaces[0]?.vacant, true)
assert.equal(island?.spaces[1]?.kind, "goods")
assert.equal(island?.spaces[1]?.vacant, false)
assert.equal(meterFree(island!), 1)
const coach = poles.find((pole) => pole.id === "2")
assert.equal(coach?.spaces[0]?.vacant, null)
assert.equal(meterPolesNear(poles, 114.15, 22.28, 500, METER_CAP).map((pole) => pole.id).join(","), "1")
assert.equal(parseMeterSites(spaces).length, 2)
assert.equal(meterClock("10/05/2026 06:46:59 PM"), "18:46")
assert.equal(meterClock("10/05/2026 12:10:34 AM"), "00:10")
assert.equal(meterClock("10/05/2026 08:32:58 AM"), "08:32")
assert.equal(meterClock(""), "")
const crowded = island
  ? Array.from({ length: METER_CAP + 5 }, (_, index): MeterPole => ({ ...crowdedPole(island, index) }))
  : []
assert.equal(meterPolesNear(crowded, 114.15, 22.28, 5_000).length, METER_CAP)

const west = Array.from({ length: 40 }, (_, index): MeterPole => ({ ...crowdedPole(island!, index), lng: 113.9 + index * 0.0001, lat: 22.2 }))
const east = Array.from({ length: 40 }, (_, index): MeterPole => ({ ...crowdedPole(island!, index + 40), lng: 114.4 + index * 0.0001, lat: 22.4 }))
const spread = meterPolesWide([...west, ...east], 114.15, 22.3, 80_000, 10)
assert.equal(spread.length, 10)
assert.ok(spread.some((pole) => pole.lng < 114))
assert.ok(spread.some((pole) => pole.lng > 114.3))
assert.equal(meterPolesWide(west, 113.9, 22.2, 5_000, METER_WIDE_CAP).length, west.length)

function crowdedPole(pole: MeterPole, index: number): MeterPole {
  return { ...pole, id: String(index), lng: pole.lng + index * 0.00001 }
}

assert.equal(meterPlateCount(island!), "1")

const full: MeterPole = {
  id: "full",
  lng: 114.15,
  lat: 22.28,
  streetTc: "香島道",
  streetEn: "Island Road",
  sectionTc: "",
  sectionEn: "",
  spaces: [
    { id: "a", kind: "general", vacant: false, updated: "" },
    { id: "b", kind: "general", vacant: false, updated: "" },
  ],
}
const closed: MeterPole = {
  ...full,
  id: "closed",
  spaces: [{ id: "c", kind: "general", vacant: null, updated: "" }],
}
assert.equal(meterPlateCount(full), "0")
assert.equal(meterPlateCount(closed), null)

assert.equal(meterFleet(island!), "private")
assert.equal(meterMark(island!), "private-open")
assert.equal(meterFleet(full), "private")
assert.equal(meterMark(full), "private-full")
assert.equal(meterFleet(closed), "private")
assert.equal(meterMark(closed), "private-closed")
assert.equal(meterFleet(coach!), "other")
assert.equal(meterMark(coach!), "other-closed")

const goodsOpen: MeterPole = {
  ...full,
  id: "goods-open",
  spaces: [{ id: "g", kind: "goods", vacant: true, updated: "" }],
}
const goodsFull: MeterPole = {
  ...goodsOpen,
  id: "goods-full",
  spaces: [{ id: "g", kind: "goods", vacant: false, updated: "" }],
}
const coachOpen: MeterPole = {
  ...goodsOpen,
  id: "coach-open",
  spaces: [{ id: "c", kind: "coach", vacant: true, updated: "" }],
}
const mixedGoodsFree: MeterPole = {
  ...full,
  id: "mixed-goods",
  spaces: [
    { id: "a", kind: "general", vacant: false, updated: "" },
    { id: "g", kind: "goods", vacant: true, updated: "" },
  ],
}
const mixedBothFree: MeterPole = {
  ...full,
  id: "mixed-both",
  spaces: [
    { id: "a", kind: "general", vacant: true, updated: "" },
    { id: "g", kind: "goods", vacant: true, updated: "" },
  ],
}
const mixedFull: MeterPole = {
  ...full,
  id: "mixed-full",
  spaces: [
    { id: "a", kind: "general", vacant: false, updated: "" },
    { id: "c", kind: "coach", vacant: false, updated: "" },
  ],
}
assert.equal(meterFleet(goodsOpen), "other")
assert.equal(meterFleet(goodsFull), "other")
assert.equal(meterFleet(coachOpen), "other")
assert.equal(meterMark(goodsOpen), "other-open")
assert.equal(meterFleet(mixedGoodsFree), "other")
assert.equal(meterFleet(mixedBothFree), "private")
assert.equal(meterPlateCount(mixedBothFree), "2")
assert.equal(meterPlateCount(mixedGoodsFree), "1")
const unread: MeterPole = {
  ...full,
  id: "unread",
  spaces: [{ id: "u", kind: "general", vacant: null, updated: "" }],
}
const switchedOff: MeterPole = {
  ...full,
  id: "off",
  spaces: [{ id: "n", kind: "general", vacant: null, updated: "11/02/2026 09:00:00 PM" }],
}
assert.equal(meterReported(unread), false)
assert.equal(meterReported(switchedOff), true)
assert.equal(meterPlateCount(unread), null)
assert.equal(meterMark(switchedOff), "private-closed")
assert.equal(meterFleet(mixedFull), "private")
const coachAndGoods: MeterPole = {
  ...full,
  id: "coach-goods",
  spaces: [
    { id: "c", kind: "coach", vacant: true, updated: "" },
    { id: "g", kind: "goods", vacant: true, updated: "" },
  ],
}
assert.equal(meterFleet(coachAndGoods), "other")
assert.equal(meterPlateCount(coachAndGoods), "2")
assert.equal(meterInk("private", "open").stroke, "#1d4ed8")
assert.equal(meterInk("other", "open").stroke, "#a21caf")
assert.equal(meterInk("other", "open").fill, "#fae8ff")
assert.equal(meterInk("other", "full").stroke, "#86198f")
assert.equal(meterInk("other", "closed").stroke, "#c084fc")
assert.equal(meterInk("private", "full").stroke, "#475569")
assert.deepEqual(meterPin(goodsOpen), { mark: "other-open", stroke: "#a21caf" })
assert.deepEqual(meterPin(full), { mark: "private-full", stroke: "#475569" })
assert.equal(meterUnionsCovered, true)
const strokeStops = meterColorStops("stroke")
const fillStops = meterColorStops("fill")
assert.deepEqual(
  strokeStops.map(([mark]) => mark),
  ["private-open", "private-full", "private-closed", "other-open", "other-full", "other-closed"],
)
assert.deepEqual(strokeStops.map(([mark]) => mark), fillStops.map(([mark]) => mark))
assert.equal(strokeStops.find(([mark]) => mark === "other-open")?.[1], meterInk("other", "open").stroke)
assert.equal(fillStops.find(([mark]) => mark === "private-closed")?.[1], meterInk("private", "closed").fill)

console.log("meter plate ok")
