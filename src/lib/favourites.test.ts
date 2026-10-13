import assert from "node:assert/strict"
import {
  PLACES_LIMIT,
  favouriteFromHit,
  loadPlaces,
  mergePlaces,
  PLACES_KEY,
  placesFile,
  placesFromFile,
  readPlacesFile,
  readPlaces,
  savePlaces,
  togglePlace,
  type Favourite,
  type PlaceStore,
} from "./favourites.ts"

const jordan: Favourite = {
  layer: "kmb",
  id: "JORDAN",
  nameTc: "佐敦",
  nameEn: "Jordan",
  coordinates: [114.171757, 22.304932],
}
const huanggang: Favourite = {
  layer: "control",
  id: "HGP",
  nameTc: "皇崗",
  nameEn: "Huanggang",
  coordinates: [114.06773, 22.52319],
}

assert.deepEqual(readPlaces(null), [])
assert.deepEqual(readPlaces("{"), [])
assert.deepEqual(readPlaces(JSON.stringify({ places: [jordan, { layer: "speed", id: "x", nameTc: "路", nameEn: "Road", coordinates: [114, 22] }] })), [jordan])

assert.deepEqual(togglePlace([], jordan), [jordan])
assert.deepEqual(togglePlace([jordan], jordan), [])
const full = Array.from({ length: PLACES_LIMIT }, (_, index) => ({ ...jordan, id: `S${index}` }))
assert.equal(togglePlace(full, huanggang).length, PLACES_LIMIT)
assert.equal(togglePlace(full, huanggang).some((place) => place.id === "HGP"), false)
assert.deepEqual(togglePlace([full[0]!, jordan], jordan), [full[0]!])

const renamed = { ...jordan, nameEn: "Jordan Road" }
assert.deepEqual(mergePlaces([huanggang, jordan], [renamed]), [renamed, huanggang])
assert.equal(mergePlaces(full, [huanggang])[0]?.id, "HGP")
assert.equal(mergePlaces(full, [huanggang]).length, PLACES_LIMIT)

const file = placesFile([jordan])
assert.deepEqual(placesFromFile(file), [jordan])
assert.deepEqual(placesFromFile("[]"), [])

const stop = favouriteFromHit(
  "kmb-stop-label",
  { id: "JORDAN", nameTc: "佐敦", nameEn: "Jordan" },
  { type: "Point", coordinates: [114.171757, 22.304932] },
)
assert.deepEqual(stop, jordan)
assert.equal(favouriteFromHit("mtr-trains", { id: "T1", nameTc: "車", nameEn: "Train" }, { type: "Point", coordinates: [114.17, 22.3] }), null)
assert.equal(favouriteFromHit("incidents", { id: "I1", nameTc: "事", nameEn: "Incident" }, { type: "Point", coordinates: [114.17, 22.3] }), null)
assert.equal(favouriteFromHit("kmb-stops", { nameTc: "佐敦", nameEn: "Jordan" }, { type: "Point", coordinates: [114.17, 22.3] }), null)

const hall = favouriteFromHit(
  "control-points",
  { code: "HGP", name: "Huanggang" },
  { type: "Point", coordinates: [114.06773, 22.52319] },
)
assert.equal(hall?.layer, "control")
assert.equal(hall?.id, "HGP")
assert.equal(hall?.nameTc, "皇崗")
assert.equal(hall?.nameEn, "Huanggang")

const meter = favouriteFromHit(
  "meters",
  { id: "pole-1", streetTc: "彌敦道", streetEn: "Nathan Road" },
  { type: "Point", coordinates: [114.172, 22.3] },
)
assert.equal(meter?.nameTc, "彌敦道")
assert.equal(meter?.nameEn, "Nathan Road")

function memoryStore(seed: string | null): PlaceStore & { raw: string | null } {
  const box = { raw: seed }
  return {
    get raw() {
      return box.raw
    },
    set raw(value: string | null) {
      box.raw = value
    },
    getItem(key: string) {
      return key === PLACES_KEY ? box.raw : null
    },
    setItem(key: string, value: string) {
      if (key !== PLACES_KEY) return
      box.raw = value
    },
  }
}

const store = memoryStore(null)
assert.deepEqual(loadPlaces(store), [])
assert.equal(savePlaces(store, [jordan]), true)
assert.deepEqual(loadPlaces(store), [jordan])
const refusing: PlaceStore = {
  getItem: () => null,
  setItem: () => {
    throw new Error("private")
  },
}
assert.equal(savePlaces(refusing, [jordan]), false)

const pier = favouriteFromHit(
  "ferry-piers",
  { id: "central", nameTc: "中環", nameEn: "Central" },
  { type: "Point", coordinates: [114.16, 22.29] },
)
assert.equal(pier?.id, "central")
assert.equal(favouriteFromHit("ferry-vessels", { id: "boat", nameTc: "船", nameEn: "Boat" }, { type: "Point", coordinates: [114.16, 22.29] }), null)

const street = favouriteFromHit(
  "cameras-city",
  { id: "H123", name: "Connaught Road Central", nameTc: "干諾道中" },
  { type: "Point", coordinates: [114.15, 22.28] },
)
assert.equal(street?.layer, "cameras")
assert.equal(street?.id, "H123")
assert.equal(street?.nameTc, "干諾道中")
assert.equal(street?.nameEn, "Connaught Road Central")
assert.equal(
  favouriteFromHit("cameras-harbour", { id: "H1", name: "Pier", nameTc: "" }, { type: "Point", coordinates: [114.15, 22.28] })?.nameEn,
  "Pier",
)
assert.equal(
  favouriteFromHit("cameras-portal", { id: "P1", name: "Tunnel", nameTc: "隧道" }, { type: "Point", coordinates: [114.18, 22.3] })?.layer,
  "cameras",
)

const housing = favouriteFromHit(
  "speed-cams",
  { id: "1", name: "Aberdeen Praya Road", nameTc: "香港仔海旁道", nameSc: "香港仔海旁道" },
  { type: "Point", coordinates: [114.15, 22.25] },
)
assert.equal(housing?.layer, "speedcam")
assert.equal(housing?.id, "1")
assert.equal(housing?.nameEn, "Aberdeen Praya Road")
assert.equal(housing?.nameTc, "香港仔海旁道")
const light = favouriteFromHit(
  "speed-cams",
  { id: "rlc-1", name: "Queensway", nameTc: "金鐘道" },
  { type: "Point", coordinates: [114.17, 22.28] },
)
assert.equal(light?.layer, "speedcam")
assert.equal(light?.id, "rlc-1")
assert.equal(favouriteFromHit("works", { id: "W1", name: "Road", nameTc: "路" }, { type: "Point", coordinates: [114.17, 22.3] }), null)
assert.deepEqual(readPlacesFile("not json"), { ok: false })
assert.deepEqual(readPlacesFile(JSON.stringify({ version: 1, places: [jordan] })), { ok: true, places: [jordan] })
assert.deepEqual(readPlacesFile(JSON.stringify({ version: 1, places: [] })), { ok: true, places: [] })

console.log("favourites ok")
