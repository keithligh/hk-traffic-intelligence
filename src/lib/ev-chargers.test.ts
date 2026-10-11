import assert from "node:assert/strict"
import catalogueFile from "../../data/ev-chargers.json" with { type: "json" }
import { CHARGER_CAP, chargersInsideParks, chargersNear, joinChargers, joinLive, keepChargerReading, parseChargerPlaces, type ChargerPlace } from "./ev-chargers.ts"

const places = parseChargerPlaces(catalogueFile)
const citic = places.find((place) => place.nameTc === "中信大廈")
assert.ok(citic)
assert.ok(Math.abs(citic.lng - 114.16712) < 0.001)
assert.equal(citic.districtTc, "中西區")
assert.equal(places.some((place) => place.nameTc.includes("英皇道1063")), false)
assert.equal(places.some((place) => place.nameEn === "Millennium City 1"), false)
assert.equal(places.some((place) => place.nameEn === "Hopewell Centre II"), false)
assert.equal(places.some((place) => place.nameTc.includes("蘇屋邨第二期")), false)

const langham = places.find((place) => place.nameTc === "朗豪坊")
assert.ok(langham)
assert.equal(langham.districtTc, "油尖旺")

const aroundCitic = chargersNear(places, 114.167, 22.281, 500)
assert.ok(aroundCitic.some((place) => place.id === citic.id))
assert.ok(aroundCitic.length <= CHARGER_CAP)

const crowded = Array.from({ length: CHARGER_CAP + 5 }, (_, index): ChargerPlace => ({
  ...citic,
  id: String(index),
  lng: citic.lng + index * 0.00001,
}))
assert.equal(chargersNear(crowded, citic.lng, citic.lat, 5_000).length, CHARGER_CAP)
assert.equal(parseChargerPlaces({ places: [{ id: "x", nameTc: "外", lng: 10, lat: 10 }] }).length, 0)

const inside = chargersInsideParks(
  [{ ...citic, id: "inside", lng: citic.lng, lat: citic.lat + 0.00005 }],
  [{ id: "park", lng: citic.lng, lat: citic.lat }],
)
assert.equal(inside.get("park")?.[0]?.id, "inside")
const both = chargersInsideParks(
  [
    { ...citic, id: "near", lng: citic.lng, lat: citic.lat },
    { ...citic, id: "also", lng: citic.lng + 0.00008, lat: citic.lat, free: 2 },
  ],
  [{ id: "park", lng: citic.lng, lat: citic.lat }],
)
assert.deepEqual(both.get("park")?.map((place) => place.id), ["near", "also"])
const outside = chargersInsideParks(
  [{ ...citic, id: "outside", lng: citic.lng + 0.001, lat: citic.lat }],
  [{ id: "park", lng: citic.lng, lat: citic.lat }],
)
assert.equal(outside.size, 0)

const joined = joinChargers(
  [{ ...citic, id: "june", nameEn: "Citygate", lng: 113.94, lat: 22.29, free: null }],
  [{ id: "9", name: "Citygate", provider: "CLP", lng: 113.94001, lat: 22.29001, address: "", free: 2, updated: "", quick: 2, semiQuick: 0 }],
)
assert.equal(joined.find((place) => place.id === "june")?.free, 2)
assert.equal(joined.some((place) => place.id === "clp:9"), false)
const added = joinChargers([], [{ id: "9", name: "Citygate", provider: "CLP", lng: 113.94, lat: 22.29, address: "", free: null, updated: "", quick: 1, semiQuick: 0 }])
assert.equal(added[0]?.id, "clp:9")
assert.equal(added[0]?.free, null)
const kept = joinChargers(
  [{ ...citic, id: "june", nameEn: "Citygate", lng: 113.94, lat: 22.29, free: 4 }],
  [{ id: "9", name: "Citygate", provider: "CLP", lng: 113.94, lat: 22.29, address: "", free: null, updated: "", quick: 1, semiQuick: 0 }],
)
assert.equal(kept.find((place) => place.id === "june")?.free, 4)
assert.equal(kept.some((place) => place.id === "clp:9"), false)

const north = { ...citic, id: "north", nameEn: "North", nameTc: "北角", lng: 114.2, lat: 22.29, free: null as number | null, standard: 1, medium: 1, quick: 1, fast: 1 }
const published = joinLive([north], [{
  id: "PIS-1",
  source: "epd",
  name: "North Point",
  nameTc: "北角政府合署",
  lng: 114.20002,
  lat: 22.29002,
  free: 0,
  standard: 0,
  medium: 29,
  quick: 0,
  fast: 0,
  publishCounts: true,
}], "prefer")
assert.equal(published.find((place) => place.id === "north")?.free, 0)
assert.equal(published.find((place) => place.id === "north")?.medium, 29)
assert.equal(published.find((place) => place.id === "north")?.standard, 0)
const unpublished = joinLive(
  [{ ...north, free: 4 }],
  [{ id: "PIS-2", source: "epd", name: "North Point", nameTc: "北角", lng: 114.2, lat: 22.29, free: null, standard: 0, medium: 4, quick: 0, fast: 0, publishCounts: true }],
  "prefer",
)
assert.equal(unpublished.find((place) => place.id === "north")?.free, 4)

const closer = joinLive(
  [{ ...north }],
  [
    { id: "far", source: "epd", name: "Far", nameTc: "遠站", lng: 114.20008, lat: 22.29, free: 9, standard: 0, medium: 1, quick: 0, fast: 0, publishCounts: true },
    { id: "near", source: "epd", name: "Near", nameTc: "近站", lng: 114.20001, lat: 22.29, free: 2, standard: 0, medium: 3, quick: 0, fast: 0, publishCounts: true },
  ],
  "prefer",
)
assert.equal(closer.find((place) => place.id === "north")?.free, 2)
assert.equal(closer.some((place) => place.id === "epd:far"), true)
assert.equal(closer.some((place) => place.id === "epd:near"), false)
const keptReading = { id: "live", nameTc: "活", nameEn: "Live", districtTc: "", lng: 114.2, lat: 22.3, standard: 0, medium: 1, quick: 0, fast: 0, free: 4 }
const juneOnly = { ...keptReading, id: "june", free: null }
assert.equal(keepChargerReading([keptReading], null, [juneOnly])[0]?.id, "live")
assert.equal(keepChargerReading(null, [keptReading], [juneOnly])[0]?.free, 4)
assert.equal(keepChargerReading([], [keptReading], [juneOnly])[0]?.free, 4)
assert.equal(keepChargerReading(null, null, [juneOnly])[0]?.id, "june")

console.log("ev-chargers ok")
