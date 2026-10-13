import assert from "node:assert/strict"
import { register } from "node:module"
import { MESSAGES } from "./i18n.ts"
import type { IntelInput } from "./intel.ts"

const hook = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = new URL("../" + specifier.slice(2) + ".ts", ${JSON.stringify(import.meta.url)})
    return nextResolve(target.href, context)
  }
  return nextResolve(specifier, context)
}
`
register(`data:text/javascript,${encodeURIComponent(hook)}`)

const { firstOpenBoundary, intelBoard } = await import("./intel.ts")

const quiet: IntelInput = {
  trafficError: null,
  traffic: null,
  incidents: null,
  incidentsError: null,
  works: null,
  controlPoints: null,
  controlError: null,
  approaches: [],
  approachesError: null,
  warnings: [],
  warningsReady: true,
  warningsError: null,
  conditions: null,
  pictureError: null,
  mtrError: null,
  kmbError: null,
  lrtError: null,
  citybusError: null,
  gmbError: null,
  nlbError: null,
  mtrBusError: null,
  ferryError: null,
  mapError: null,
}

const clear = intelBoard(quiet, MESSAGES.en)
assert.deepEqual(clear.systems, [])

const failed = intelBoard(
  { ...quiet, ferryError: "HTTP 502", kmbError: "KMB arrivals failed", mapError: "Map failed" },
  MESSAGES.en,
)
assert.deepEqual(
  failed.systems.map((item) => item.id),
  ["fault-map", "fault-kmb", "fault-ferry"],
)
assert.equal(failed.systems[0]?.title, MESSAGES.en.mapFailed)
assert.equal(failed.systems[1]?.title, MESSAGES.en.kmbStopsFailed)
assert.equal(failed.ranked.find((item) => item.id === "fault-kmb")?.title, MESSAGES.en.kmbStopsFailed)
assert.equal(failed.systems[2]?.detail, "HTTP 502")

const stopList = intelBoard(
  {
    ...quiet,
    kmbError: "KMB stops failed",
    citybusError: "Citybus stops failed",
    gmbError: "Green minibus stops failed",
    nlbError: "New Lantao Bus stops failed",
    mtrBusError: null,
  },
  MESSAGES["zh-HK"],
)
assert.deepEqual(
  stopList.ranked.map((item) => item.title),
  [
    MESSAGES["zh-HK"].kmbStopsFailed,
    MESSAGES["zh-HK"].citybusStopsFailed,
    MESSAGES["zh-HK"].gmbStopsFailed,
    MESSAGES["zh-HK"].nlbStopsFailed,
  ],
)
assert.equal(stopList.ranked.some((item) => item.title === MESSAGES["zh-HK"].kmbFailed), false)
assert.equal(MESSAGES["zh-CN"].kmbStopsFailed, "未能载入九巴车站。")
assert.equal(MESSAGES["zh-CN"].citybusStopsFailed, "未能载入城巴车站。")
assert.equal(MESSAGES["zh-CN"].gmbStopsFailed, "未能载入绿色专线小巴车站。")
assert.equal(MESSAGES["zh-CN"].nlbStopsFailed, "未能载入屿巴车站。")

const missedStop = intelBoard(
  { ...quiet, boardFaults: [{ operator: "citybus", id: "002155", name: "保泰街" }] },
  MESSAGES["zh-HK"],
)
assert.equal(missedStop.systems.length, 1)
assert.equal(missedStop.systems[0]?.title, "未能取得城巴到站時間。")
assert.equal(missedStop.systems[0]?.detail, "保泰街")
assert.equal(missedStop.ranked.some((item) => item.detail === "保泰街"), false)

function hall(code: string, worst: number, band: string): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: { code, name: code, worst, vehicleBand: band, vehicleKmh: 10, vehicleRoadEn: "Road", vehicleRoadTc: "路" },
    geometry: { type: "Point", coordinates: [114, 22] },
  }
}

const halls = intelBoard({
  ...quiet,
  controlPoints: { type: "FeatureCollection", features: [hall("LWS", 99, "congested"), hall("SBC", 0, "free"), hall("MKT", 1, "")] },
}, MESSAGES.en)
assert.equal(firstOpenBoundary(halls.boundary)?.id, "control-MKT")
assert.equal(halls.boundary[0]?.id, "control-MKT")
assert.equal(halls.ranked.some((item) => item.id === "control-LWS"), false)
assert.equal(halls.boundary.find((item) => item.id === "control-LWS")?.label, MESSAGES.en.hallClosed)
assert.equal(halls.boundary.find((item) => item.id === "control-LWS")?.detail.includes("Road"), false)

const news = intelBoard({
  ...quiet,
  incidents: {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {
        name: "Traffic Accident",
        nameTc: "交通意外",
        location: "藍田站",
        locationEn: "Lam Tin Station",
        content: "The station is closed.",
        contentTc: "藍田站關閉。",
        announced: "2026-10-13T18:00:00",
      },
      geometry: { type: "Point", coordinates: [114.233031, 22.307015] },
    }],
  },
}, MESSAGES["zh-HK"])
assert.equal(news.roads[0]?.title, "藍田站關閉。")
assert.equal(news.roads[0]?.detail, "藍田站")
