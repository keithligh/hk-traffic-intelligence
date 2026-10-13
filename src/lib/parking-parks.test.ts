import assert from "node:assert/strict"
import { carPinsWhenBoth, collapseSameSites, motorcyclePinsWhenBoth, motorcyclePlateDrop, motorcycleShift, parkLists, parseOneStopParks, parseOneStopSpaces, parseParkingParks, parseParkingSpaces, parksNear, publishedMotorcycleVacancies, publishedPrivateVacancies, oneStopCount, soloParkingRadiusMetres, type ParkingPark } from "./parking-parks.ts"

const near: ParkingPark = {
  id: "near",
  nameTc: "近",
  nameEn: "Near",
  addressTc: "",
  addressEn: "",
  lng: 114.17,
  lat: 22.28,
  heightM: null,
}
const far: ParkingPark = { ...near, id: "far", lng: 114.3, lat: 22.4 }

const listed = parkLists(
  [near, far],
  new Map([["near", 4]]),
  new Map([["far", 2]]),
)
assert.deepEqual(listed.parks.map((park) => [park.id, park.cars]), [["near", 4], ["far", null]])
assert.deepEqual(listed.motorcycles.map((park) => [park.id, park.motorcycle]), [["far", 2]])
assert.deepEqual(parksNear([far, near], 114.17, 22.28, 800).map((park) => park.id), ["near"])
assert.equal(parksNear([near, far], 114.17, 22.28, 80_000, 1)[0]?.id, "near")

const parsed = parseParkingParks({
  car_park: [{ park_id: "a", name_tc: "甲", name_en: "A", latitude: 22.2, longitude: 114.1, height: 0, displayAddress_tc: "地址" }],
})
assert.equal(parsed[0]?.heightM, null)
assert.equal(parsed[0]?.addressTc, "地址")

const spaces = parseParkingSpaces({
  car_park: [
    {
      park_id: "a",
      vehicle_type: [
        { type: "P", service_category: [{ category: "HOURLY", vacancy_type: "A", vacancy: 4, lastupdate: "2026-10-05 11:03:05" }] },
        { type: "M", service_category: [{ category: "HOURLY", vacancy_type: "B", vacancy: -1, lastupdate: "" }] },
      ],
    },
  ],
}, "a")
assert.equal(spaces[0]?.vacancy, 4)
assert.equal(spaces[1]?.vacancy, null)
assert.deepEqual(
  [...publishedMotorcycleVacancies({
    car_park: [
      { park_id: "live", vehicle_type: [{ type: "M", service_category: [{ category: "HOURLY", vacancy_type: "A", vacancy: 12 }] }] },
      { park_id: "quiet", vehicle_type: [{ type: "M", service_category: [{ category: "HOURLY", vacancy_type: "B", vacancy: -1 }] }] },
      { park_id: "cars", vehicle_type: [{ type: "P", service_category: [{ category: "HOURLY", vacancy_type: "A", vacancy: 3 }] }] },
    ],
  }).entries()],
  [["live", 12]],
)
const closeRadius = soloParkingRadiusMetres(18, 22.3)
assert.ok(closeRadius >= 800)
assert.equal(parksNear([near, { ...near, id: "half", lng: 114.175, lat: 22.284 }], 114.17, 22.28, closeRadius).length, 2)

assert.deepEqual(
  [...publishedPrivateVacancies({
    car_park: [
      { park_id: "open", vehicle_type: [{ type: "P", service_category: [{ category: "HOURLY", vacancy_type: "A", vacancy: 30 }] }] },
      { park_id: "full", vehicle_type: [{ type: "P", service_category: [{ category: "HOURLY", vacancy_type: "A", vacancy: 0 }] }] },
      { park_id: "quiet", vehicle_type: [{ type: "P", service_category: [{ category: "HOURLY", vacancy_type: "B", vacancy: 8 }] }] },
      { park_id: "van", vehicle_type: [{ type: "L", service_category: [{ category: "HOURLY", vacancy_type: "A", vacancy: 9 }] }] },
    ],
  }).entries()],
  [["open", 30], ["full", 0]],
)

const chinese = {
  results: [
    { park_Id: "12", name: "淘大商場", displayAddress: "九龍九龍灣牛頭角道77號", latitude: 22.3247, longitude: 114.21675, heightLimits: [{ height: 1.9 }] },
    { park_Id: "77", name: "金利豐國際中心", displayAddress: "觀塘", latitude: 22.323615, longitude: 114.209249, heightLimits: null },
    { park_Id: "tdc108p1", name: "金利豐國際中心", displayAddress: "觀塘", latitude: 22.323615, longitude: 114.209278, heightLimits: [{ height: 2.45 }] },
  ],
}
const english = {
  results: [
    { park_Id: "12", name: "Amoy Plaza", displayAddress: "77 Ngau Tau Kok Road" },
    { park_Id: "77", name: "Kingston", displayAddress: "Kwun Tong" },
    { park_Id: "tdc108p1", name: "Kingston", displayAddress: "Kwun Tong" },
  ],
}
function park(id: string, nameTc: string, nameEn: string, lng: number, lat: number, heightM: number | null): ParkingPark {
  return { id, nameTc, nameEn, addressTc: "", addressEn: "", lng, lat, heightM }
}

const oneStop = parseOneStopParks(chinese, english)
assert.equal(oneStop.length, 2)
assert.equal(oneStop.find((park) => park.id === "12")?.nameEn, "Amoy Plaza")
assert.equal(oneStop.find((park) => park.id === "12")?.nameTc, "淘大商場")
assert.equal(oneStop.find((park) => park.id === "12")?.heightM, 1.9)
assert.equal(oneStop.some((park) => park.id === "tdc108p1"), true)
assert.equal(oneStop.some((park) => park.id === "77"), false)
assert.equal(collapseSameSites(oneStop).length, 2)

const publishedTwice = collapseSameSites([
  park("120", "彩盈邨停車場", "Choi Ying Estate Car Park", 114.21452, 22.3285, null),
  park("tdc129p3", "彩盈邨車場", "Choi Ying Estate Car Park", 114.2144, 22.32824, null),
  park("104", "AIRSIDE", "AIRSIDE", 114.1982, 22.3311, 2.4),
  park("tdc121p1", "Airside", "Airside", 114.19834, 22.33117, 2.4),
  park("93", "康寧道公園停車場", "Hong Ning Road Park Car Park", 114.23, 22.31, 2.45),
  park("tdc53p3", "康寧道公園", "Hong Ning Road Park", 114.2301, 22.3101, null),
  park("tdc14p4259", "沙角1號停車場", "Sha Kok Car Park 1", 114.19, 22.38, 1.7),
  park("tdc14p4258", "沙角2號停車場", "Sha Kok Car Park 2", 114.1901, 22.3801, 2),
  park("tdstt155", "海裕街停車場", "Hoi Yu Street Car Park", 114.2148, 22.2901, null),
  park("tdstt141", "海裕街停車場", "Hoi Yu Street Car Park", 114.2126, 22.2911, null),
])
assert.equal(publishedTwice.length, 7)
assert.equal(publishedTwice.find((item) => item.nameEn.includes("Choi"))?.id, "tdc129p3")
assert.equal(publishedTwice.find((item) => item.nameEn.toLowerCase() === "airside")?.id, "tdc121p1")
assert.equal(publishedTwice.find((item) => item.id === "tdc53p3")?.heightM, 2.45)
assert.equal(publishedTwice.filter((item) => item.nameEn.includes("Sha Kok")).length, 2)
assert.equal(publishedTwice.filter((item) => item.nameEn.includes("Hoi Yu")).length, 2)

const bothLayers = [
  { id: "air", cars: 71 },
  { id: "bikes", cars: null },
  { id: "cars", cars: 4 },
]
const bikeIds = new Set(["air", "bikes"])
const carIds = new Set(["air", "cars"])
assert.deepEqual(carPinsWhenBoth(bothLayers, true, bikeIds).map((item) => item.id), ["air", "cars"])
assert.deepEqual(carPinsWhenBoth(bothLayers, false, bikeIds).map((item) => item.id), ["air", "bikes", "cars"])
assert.deepEqual(motorcyclePinsWhenBoth([{ id: "air" }, { id: "bikes" }]).map((item) => item.id), ["air", "bikes"])
assert.deepEqual(motorcyclePinsWhenBoth([{ id: "air" }]).map((item) => item.id), ["air"])
assert.equal(motorcyclePlateDrop("air", carIds), 1)
assert.equal(motorcyclePlateDrop("bikes", carIds), 0)
assert.equal(motorcyclePlateDrop("air", new Set()), 0)
assert.deepEqual(motorcycleShift(true, 32), [0, 32])
assert.equal(motorcycleShift(false, 32), null)
assert.equal(motorcycleShift(true, 0), null)

const vacancy = {
  results: [
    { park_Id: "open", privateCar: [{ vacancy_type: "A", vacancy: 29, vacancyEV: 1, lastupdate: "2026-10-07 02:10:03" }], motorCycle: [{ vacancy_type: "A", vacancy: 6, lastupdate: "2026-10-07 02:10:03" }] },
    { park_Id: "full", privateCar: [{ vacancy_type: "A", vacancy: 0, lastupdate: "2026-10-07 02:10:03" }] },
    { park_Id: "quiet", privateCar: [{ vacancy_type: "B", vacancy: 1, lastupdate: "2026-10-07 02:10:03" }] },
    { park_Id: "shut", privateCar: [{ vacancy_type: "C", vacancy: 0, lastupdate: "2026-10-07 02:10:03" }] },
    { park_Id: "blank", privateCar: [{ vacancy_type: "A", vacancy: -1, lastupdate: "2026-10-07 02:10:03" }] },
  ],
}
assert.equal(parseOneStopSpaces(vacancy, "open").find((space) => space.kind === "private")?.state, "number")
assert.equal(parseOneStopSpaces(vacancy, "open").find((space) => space.kind === "private")?.ev, 1)
assert.equal(parseOneStopSpaces(vacancy, "full").find((space) => space.kind === "private")?.ev, null)
assert.equal(parseOneStopSpaces(vacancy, "open").find((space) => space.kind === "motorcycle")?.vacancy, 6)
assert.equal(parseOneStopSpaces(vacancy, "full").find((space) => space.kind === "private")?.vacancy, 0)
assert.equal(parseOneStopSpaces(vacancy, "quiet")[0]?.state, "unpublished")
assert.equal(parseOneStopSpaces(vacancy, "shut")[0]?.state, "closed")
assert.equal(parseOneStopSpaces(vacancy, "blank")[0]?.state, "unpublished")
assert.deepEqual([...oneStopCount(vacancy, "privateCar").entries()], [["open", 29], ["full", 0]])

console.log("parking-parks ok")
