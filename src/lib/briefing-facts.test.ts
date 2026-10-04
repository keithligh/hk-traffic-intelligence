import assert from "node:assert/strict"
import { briefingFacts, fastestCrossings, jammedRoads } from "./briefing-facts.ts"
import type { Corridor } from "./types.ts"

const corridor = (id: string, roadTc: string, roadEn: string, band: Corridor["band"], speedKmh: number | null, lengthKm: number): Corridor => ({
  id,
  roadTc,
  roadEn,
  direction: "",
  speedKmh,
  band,
  lengthKm,
  detectorCount: 0,
  coordinates: [],
})

const corridors = [
  corridor("1", "告士打道", "GLOUCESTER ROAD", "congested", 6, 1.5),
  corridor("2", "告士打道", "GLOUCESTER ROAD", "congested", 4, 0.8),
  corridor("3", "窩打老道", "WATERLOO ROAD", "congested", 7, 3.9),
  corridor("4", "短路", "SHORT ROAD", "congested", 3, 0.2),
  corridor("5", "彌敦道", "NATHAN ROAD", "slow", 20, 5),
  corridor("6", "", "", "congested", 2, 9),
  corridor("7", "皇后大道東", "QUEEN'S ROAD EAST", "congested", 7, 0.6),
  // Marked congested by the feed while moving at 84 km/h, as seen on Tolo Highway.
  corridor("8", "吐露港公路", "TOLO HIGHWAY", "congested", 84, 2.8),
]

// Jams are grouped by road, longest first, with the slowest reading; short stubs and unnamed roads drop out.
assert.deepEqual(jammedRoads(corridors, 5), [
  { tc: "窩打老道", en: "Waterloo Road", km: 3.9, slowestKmh: 7 },
  { tc: "告士打道", en: "Gloucester Road", km: 2.3, slowestKmh: 4 },
  { tc: "皇后大道東", en: "Queen's Road East", km: 0.6, slowestKmh: 7 },
])
assert.equal(jammedRoads(corridors, 1).length, 1)

const facts = briefingFacts({
  at: new Date(Date.UTC(2026, 9, 3, 6, 20)),
  traffic: {
    ok: true,
    corridors,
    summary: { corridorCount: 6, detectorCount: 0, meanSpeedKmh: 62.44, free: 3200, slow: 800, congested: 200, unknown: 10 },
  },
  crossings: [
    { code: "CH", minutes: 6 },
    { code: "EH", minutes: 5 },
  ],
  incidents: [{ tc: "交通意外", en: "Traffic accident", whereTc: "青雲路", whereEn: "Tsing Wan Road" }],
  warnings: [{ name: "Amber Rainstorm Warning Signal" }],
  conditions: { temperatureC: 28, rainfallMm: 0, rainfallPlace: "" },
})

assert.equal(
  facts,
  [
    "Time: 2026-10-03 14:20 Hong Kong time",
    "Road network: mean 62 km/h; segments free 3200, slow 800, congested 200",
    "Harbour crossings, fastest published time from any start: Cross-Harbour Tunnel (紅隧) 6 min, Eastern Harbour Crossing (東隧) 5 min",
    "Congested roads, longest first: 窩打老道 Waterloo Road 3.9 km, slowest 7 km/h; 告士打道 Gloucester Road 2.3 km, slowest 4 km/h; 皇后大道東 Queen's Road East 0.6 km, slowest 7 km/h",
    "Open traffic incidents: 交通意外 Traffic accident at 青雲路 Tsing Wan Road",
    "Weather warnings now in effect: Amber Rainstorm Warning Signal",
    "Weather: 28°C, rainfall in the past hour 0 mm",
  ].join("\n"),
)

// Missing readings are said plainly; absent incidents and warnings are left out entirely.
const quiet = briefingFacts({ at: new Date(Date.UTC(2026, 9, 3, 6, 20)), traffic: null, crossings: [], incidents: [], warnings: [], conditions: null })
assert.match(quiet, /Road network: no reading/)
assert.match(quiet, /Harbour crossings: no reading/)
assert.match(quiet, /Congested roads: none/)
assert.doesNotMatch(quiet, /incident/i)
assert.doesNotMatch(quiet, /warning/i)
assert.doesNotMatch(quiet, /Weather: /)

// The fastest time each tunnel has from any published start, tunnels in a fixed order.
const leg = (code: string, minutes: number | null) => ({ code, name: code, minutes, colour: "green" as const })
const start = (id: string, legs: ReturnType<typeof leg>[]) => ({ id, name: id, nameTc: id, coordinates: [0, 0] as [number, number], legs })
assert.deepEqual(
  fastestCrossings([start("H1", [leg("EH", 9), leg("CH", 7)]), start("H11", [leg("CH", 25), leg("EH", 5), leg("TKO", 1)]), start("K08", [leg("WH", null)])]),
  [
    { code: "CH", minutes: 7 },
    { code: "EH", minutes: 5 },
  ],
)

console.log("briefing facts ok")
