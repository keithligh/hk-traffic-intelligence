import assert from "node:assert/strict"
import { askFacts } from "./ask-facts.ts"
import type { AskInput } from "./ask-facts.ts"

const leg = (code: string, minutes: number | null) => ({ code, name: code, minutes, colour: "green" as const })
const corridor = (id: string, roadTc: string, roadEn: string, speedKmh: number, lengthKm: number) => ({
  id,
  roadTc,
  roadEn,
  direction: "",
  speedKmh,
  band: "congested" as const,
  lengthKm,
  detectorCount: 0,
  coordinates: [] as [number, number][],
})
const hall = (code: string, name: string, codes: [number, number, number, number]) => ({
  type: "Feature" as const,
  geometry: { type: "Point" as const, coordinates: [0, 0] },
  properties: { code, name, residentArrCode: codes[0], residentDepCode: codes[1], visitorArrCode: codes[2], visitorDepCode: codes[3] },
})

const input: AskInput = {
  at: new Date(Date.UTC(2026, 9, 4, 1, 30)),
  traffic: {
    ok: true,
    corridors: [corridor("1", "告士打道", "GLOUCESTER ROAD", 6, 1.5), corridor("2", "窩打老道", "WATERLOO ROAD", 9, 3.9)],
    summary: { corridorCount: 2, detectorCount: 0, meanSpeedKmh: 61.6, free: 3000, slow: 700, congested: 180, unknown: 0 },
  },
  starts: [
    { id: "H1", name: "Gloucester Road eastbound near Revenue Tower", nameTc: "告士打道東行近稅務大樓", coordinates: [0, 0], legs: [leg("CH", 7), leg("EH", 9)] },
    { id: "K08", name: "Kai Cheung Road westbound", nameTc: "啓祥道西行", coordinates: [0, 0], legs: [leg("WH", null)] },
  ],
  incidents: [{ tc: "交通意外", en: "Traffic accident", whereTc: "青雲路", whereEn: "Tsing Wan Road" }],
  warnings: [],
  conditions: { temperatureC: 28, rainfallMm: 0, rainfallPlace: "" },
  halls: [hall("LSC", "Lok Ma Chau Spur Line", [0, 1, 2, 0]), hall("HYW", "Heung Yuen Wai", [0, 0, 0, 0]), hall("XXX", "Closed Point", [99, 99, 99, 99])],
}

const facts = askFacts(input).split("\n")

assert.equal(facts[0], "Time: 2026-10-04 09:30 Hong Kong time")
// Every start with a published time gets its own line, so a question about one start can be answered.
assert.ok(facts.includes("Harbour crossing times from 告士打道東行近稅務大樓 (Gloucester Road eastbound near Revenue Tower): Cross-Harbour Tunnel (紅隧) 7 min, Eastern Harbour Crossing (東隧) 9 min"))
assert.ok(!facts.some((line) => line.includes("啓祥道西行")), "a start with no published time is left out")
assert.ok(facts.includes("Congested roads, longest first: 窩打老道 Waterloo Road 3.9 km, slowest 9 km/h; 告士打道 Gloucester Road 1.5 km, slowest 6 km/h"))
assert.ok(facts.includes("Open traffic incidents: 交通意外 Traffic accident at 青雲路 Tsing Wan Road"))
// Boundary halls: a quiet one is summarised, a busy one is spelled out per direction.
assert.ok(facts.includes("Boundary control point 落馬洲支線 (Lok Ma Chau Spur Line): residents arriving normal, residents departing busy, visitors arriving very busy, visitors departing normal"))
assert.ok(facts.includes("Boundary control point 香園圍 (Heung Yuen Wai): all four halls normal (residents and visitors, arriving and departing)"))
assert.ok(facts.includes("Boundary halls: arriving means entering Hong Kong; departing means leaving Hong Kong for the Mainland; normal, busy and very busy describe how crowded each hall's queue is"))
assert.ok(facts.some((line) => line.startsWith("Boundary control point") && line.includes("Closed Point") && line.includes("closed")))
// Unlike the briefing, a question needs to hear "none", or it reads absence as "not covered".
assert.ok(facts.includes("Weather warnings now in effect: none"))
assert.ok(askFacts({ ...input, incidents: [] }).includes("Open traffic incidents: none"))

// Fixed reference: which side of the harbour each published start is on and the districts it
// serves, so the model need not guess Hong Kong geography (it put Tseung Kwan O on the Island side).
// One line per district, so a quote never has to cut a list.
assert.ok(facts.includes("Reference, fixed: 中環 Central is on Hong Kong Island; nearest start 告士打道東行近稅務大樓"))
assert.ok(facts.includes("Reference, fixed: 灣仔 Wan Chai is on Hong Kong Island; nearest start 告士打道東行近稅務大樓"))
assert.ok(!facts.some((line) => line.includes("nearest start 啓祥道西行")), "no reference for a start with no published time")
assert.ok(askFacts({ ...input, starts: [...input.starts, { id: "K08", name: "Kai Cheung Road westbound near Kowloon Bay Divisional Fire Station", nameTc: "啓祥道西行近九龍灣消防總局", coordinates: [0, 0], legs: [leg("EH", 9)] }] }).includes(
  "Reference, fixed: 將軍澳 Tseung Kwan O is on the Kowloon side; nearest start 啓祥道西行近九龍灣消防總局",
))

// Missing feeds are stated, so the model says it does not know instead of guessing.
const empty = askFacts({ ...input, traffic: null, starts: [], halls: null })
assert.match(empty, /Road network: no reading/)
assert.match(empty, /Harbour crossing times: no reading/)
assert.match(empty, /Boundary control points: no reading/)

console.log("ask facts ok")
