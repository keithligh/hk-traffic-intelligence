import assert from "node:assert/strict"
import {
  carryArrivalClock,
  estimateTrains,
  metresBetween,
  pathsToward,
  projectTrain,
  segmentMinutes,
  viaRacecourse,
  type EstimateRoute,
  type GeoPoint,
  type EstimatedTrain,
  type TrainObservation,
} from "./mtr-estimate.ts"
import { advanceRuns, mergeRuns, runCollection, runsFromTrains, type TrainRun } from "./mtr-run.ts"
import { useTrackEdges } from "./rail-tracks.ts"

const now = Date.parse("2026-10-01T05:40:00Z")

const places: Record<string, GeoPoint> = {}
place("A", 0)
place("B", 1440)
place("C", 2880)
place("LOW", 0)
place("LMC", 0)
place("SHS", 1440)
place("FAN", 2880)
place("ADM", 4320)
place("SHT", 0)
place("FOT", 1440)
place("UNI", 2880)
place("RAC", 1440)

const line = routes("TML", [
  ["UP", ["A", "B", "C"]],
  ["DOWN", ["C", "B", "A"]],
])
const eastRail = routes("EAL", [
  ["UT", ["LOW", "SHS", "FAN", "ADM"]],
  ["LMC-UT", ["LMC", "SHS", "FAN", "ADM"]],
  ["DT", ["ADM", "FAN", "SHS", "LOW"]],
  ["LMC-DT", ["ADM", "FAN", "SHS", "LMC"]],
])

const oneTrain = estimateTrains(line, [obs("B", "C", 1, 1), obs("C", "C", 3, 3)], locate)
assert.equal(oneTrain.length, 1)
const oneSpot = projectTrain(oneTrain[0]!, locate, now)
assert.ok(oneSpot)
assert.equal(oneSpot.from, "A")
assert.equal(oneSpot.to, "B")
assert.equal(oneSpot.clamp, "none")
assert.ok(Math.abs(oneSpot.lat - midpoint("A", "B")) < 1e-4)

const twoTrains = estimateTrains(
  line,
  [obs("B", "C", 1, 1), obs("B", "C", 5, 5), obs("C", "C", 3, 3), obs("C", "C", 7, 7)],
  locate,
)
assert.equal(twoTrains.length, 2)

const branchOnly = estimateTrains(eastRail, [obs("FAN", "ADM", 10, 10, "EAL")], locate)
assert.equal(branchOnly.length, 1)
const held = projectTrain(branchOnly[0]!, locate, now)
assert.ok(held)
assert.equal(held.from, "SHS")
assert.equal(held.to, "SHS")
assert.equal(held.clamp, "junction")
assert.equal(branchOnly[0]!.path.includes("LOW") || branchOnly[0]!.path.includes("LMC"), true)
assert.equal(branchOnly[0]!.hold.includes("LOW"), false)
assert.equal(branchOnly[0]!.hold.includes("LMC"), false)

const fromLoWu = estimateTrains(eastRail, [obs("LOW", "ADM", 1, 1, "EAL")], locate)
assert.equal(fromLoWu.length, 1)
assert.equal(fromLoWu[0]!.path[0], "LOW")
assert.equal(fromLoWu[0]!.hold.includes("LOW"), true)

const departure = estimateTrains(
  line,
  [{ ...obs("B", "C", 2, 2), timeType: "D" }],
  locate,
)
assert.equal(departure.length, 1)
assert.equal(departure[0]!.timeType, "D")
const atPlatform = projectTrain(departure[0]!, locate, now)
assert.ok(atPlatform)
assert.equal(atPlatform.from, "B")
assert.equal(atPlatform.to, "B")
assert.equal(atPlatform.clamp, "none")

const coarse = estimateTrains(line, [obs("B", "C", 1, 1), obs("C", "C", 4, 4)], locate)
assert.equal(coarse.length, 1)

const urban: EstimateRoute[] = [
  { id: "TWL-DT", line: "TWL", stations: ["P", "Q", "R", "S"] },
  { id: "TWL-UT", line: "TWL", stations: ["S", "R", "Q", "P"] },
]
place("P", 0)
place("Q", 720)
place("R", 1440)
place("S", 2160)
const sameTrain = estimateTrains(
  urban,
  [obs("Q", "S", 1, 1, "TWL"), obs("R", "S", 2, 2, "TWL")],
  locate,
)
assert.equal(sameTrain.length, 1)
const following = estimateTrains(
  urban,
  [obs("Q", "S", 1, 1, "TWL"), obs("R", "S", 0, 0, "TWL")],
  locate,
)
assert.equal(following.length, 2)

const differentTrains = estimateTrains(line, [obs("B", "C", 1, 1), obs("C", "C", 8, 8)], locate)
assert.equal(differentTrains.length, 2)

const queued = estimateTrains(line, [obs("A", "C", 3, 3), obs("A", "C", 7, 7), obs("A", "C", 11, 11)], locate)
assert.equal(queued.length, 1)
assert.equal(queued[0]!.ttnt, 3)

const leftBehind = estimateTrains(line, [obs("B", "C", 0, 0), obs("C", "C", 1, 1)], locate)
assert.equal(leftBehind.length, 1)
const leftSpot = projectTrain(leftBehind[0]!, locate, now)
assert.ok(leftSpot)
assert.equal(leftSpot.from, "B")
assert.equal(leftSpot.to, "C")

const dwellThenRun = projectTrain({ ...obsTrain("B", "C", 0), path: ["A", "B", "C"], hold: ["A", "B", "C"] }, locate, now + 90_000)
assert.ok(dwellThenRun)
assert.equal(dwellThenRun.from, "B")
assert.equal(dwellThenRun.to, "C")
assert.ok(dwellThenRun.lat > (places.B?.lat ?? 0) && dwellThenRun.lat < (places.C?.lat ?? 0))

const rollsOut = projectTrain({ ...obsTrain("B", "C", 2), timeType: "D", path: ["A", "B", "C"], hold: ["A", "B", "C"] }, locate, now + 3 * 60_000)
assert.ok(rollsOut)
assert.equal(rollsOut.from, "B")
assert.equal(rollsOut.to, "C")

const moving = advanceRuns([sampleRun(0, 12)], 5, locate)
assert.equal(moving.length, 1)
assert.ok((moving[0]?.distance ?? 0) > 50)
assert.ok((moving[0]?.speed ?? 0) > 3)

const behind = mergeRuns([sampleRun(800, 12)], [sampleRun(200, 12)], now + 1000)
const kept = behind.find((run) => run.id === "keep")
assert.ok(kept)
assert.equal(kept.distance, 800)

const far = mergeRuns([sampleRun(100, 12)], [{ ...sampleRun(3000, 12), id: "other" }], now + 1000)
assert.equal(far.find((run) => run.id === "keep")?.distance, 100)
assert.equal(far.some((run) => run.id === "other"), true)

const stillBehind = mergeRuns([sampleRun(800, 12)], [sampleRun(200, 12)], now + 1000, locate)
assert.equal(stillBehind.find((run) => run.id === "keep")?.distance, 800)

const piledRuns = mergeRuns(
  [sampleRun(1440, 12), { ...sampleRun(1440, 12), id: "second" }],
  [sampleRun(720, 12), { ...sampleRun(0, 12), id: "back" }],
  now + 1000,
  locate,
)
const piledGap = Math.abs((piledRuns[0]?.distance ?? 0) - (piledRuns[1]?.distance ?? 0))
assert.ok(piledGap > 400, `piled runs stayed ${piledGap}m apart`)

const branchClock = estimateTrains(
  eastRail,
  [obs("SHS", "ADM", 1, 1, "EAL"), obs("SHS", "ADM", 8, 8, "EAL")],
  locate,
)
assert.equal(branchClock.length, 2)
const soonSpot = projectTrain(branchClock.find((train) => train.ttnt === 1)!, locate, now)
const lateSpot = projectTrain(branchClock.find((train) => train.ttnt === 8)!, locate, now)
assert.ok(soonSpot && lateSpot)
const branchGap = metresBetween(soonSpot, lateSpot)
assert.ok(branchGap > 400, `branch clocks stayed ${branchGap.toFixed(0)}m apart`)
assert.ok(metresBetween(soonSpot, places.SHS!) < metresBetween(lateSpot, places.SHS!))

const onPlatform = estimateTrains(line, [obs("A", "C", 0, 0), obs("A", "C", 3, 3)], locate)
assert.equal(onPlatform.length, 1)
assert.equal(onPlatform[0]!.ttnt, 0)

place("HOK", 0)
place("KOW", 2335)
place("TUC", 5000)
place("AWE", 8000)
const sharedCorridor = [
  { id: "TCL-UT", line: "TCL", stations: ["HOK", "KOW", "TUC"] },
  { id: "AEL-UT", line: "AEL", stations: ["HOK", "KOW", "AWE"] },
]
const stackedLines = estimateTrains(
  sharedCorridor,
  [obs("HOK", "TUC", 0, 0, "TCL"), obs("HOK", "AWE", 8, 8, "AEL")],
  locate,
)
assert.equal(stackedLines.length, 1)
assert.equal(stackedLines[0]!.line, "TCL")
assert.equal(stackedLines[0]!.ttnt, 0)
const airportAlone = estimateTrains(sharedCorridor, [obs("HOK", "AWE", 8, 8, "AEL")], locate)
assert.equal(airportAlone.length, 1)

place("YL", 0)
place("TT", 553)
place("HL", 811)
const lightRail: EstimateRoute[] = [
  { id: "610-down", line: "610", stations: ["YL", "TT", "HL"] },
  { id: "614-down", line: "614", stations: ["YL", "TT", "HL"] },
  { id: "615-down", line: "615", stations: ["YL", "TT", "HL"] },
]
const taiTong = estimateTrains(
  lightRail,
  [
    obs("TT", "HL", 0, 0, "614"),
    obs("TT", "HL", 2, 2, "610"),
    obs("TT", "HL", 10, 10, "610"),
    obs("TT", "HL", 14, 14, "615"),
  ],
  locate,
)
assert.equal(taiTong.length, 3)
const atTaiTong = taiTong.filter((train) => projectTrain(train, locate, now)?.from === "TT")
assert.equal(atTaiTong.length, 1)
assert.equal(atTaiTong[0]?.line, "614")
const drawnRail = runCollection(runsFromTrains(asFeed(taiTong), locate, () => "#F5C400", now), locate)
assert.equal(drawnRail.features.length, 3)
const drawnPoints = drawnRail.features.flatMap((feature) => {
  const geometry = feature.geometry
  if (!geometry || geometry.type !== "Point") return []
  const [lng, lat] = geometry.coordinates
  return [{ line: feature.properties?.line, lng, lat }]
})
const queuedRail = drawnPoints.filter((point) => point.line !== "614")
assert.equal(queuedRail.length, 2)
assert.ok(queuedRail[0] && queuedRail[1])
assert.ok(metresBetween(queuedRail[0], queuedRail[1]) > 40)

const carried = carryArrivalClock(
  [{ ...obs("B", "C", 0, 0), observedAt: now - 60_000, dueAt: now - 60_000 }],
  [obs("B", "C", 0, 0)],
)
assert.equal(carried[0]!.observedAt, now - 60_000)

const departures = estimateTrains(
  line,
  [
    { ...obs("B", "C", 2, 2), timeType: "D" },
    { ...obs("B", "C", 9, 9), timeType: "D" },
  ],
  locate,
)
assert.equal(departures.length, 1)
assert.equal(departures[0]!.ttnt, 2)

const island: EstimateRoute[] = [
  { id: "ISL-UT", line: "ISL", stations: ["KET", "CEN", "CHW"] },
  { id: "ISL-DT", line: "ISL", stations: ["CHW", "CEN", "KET"] },
]
assert.deepEqual(pathsToward(island, "ISL", "CHW"), [["KET", "CEN", "CHW"]])
assert.deepEqual(pathsToward(island, "ISL", "KET"), [["CHW", "CEN", "KET"]])

const shaTin: EstimateRoute[] = [
  { id: "EAL-UT", line: "EAL", stations: ["SHT", "FOT", "UNI"] },
  { id: "EAL-DT", line: "EAL", stations: ["UNI", "FOT", "SHT"] },
]
assert.deepEqual(viaRacecourse(["SHT", "FOT", "UNI"]), ["SHT", "RAC", "UNI"])
assert.deepEqual(viaRacecourse(["UNI", "FOT", "SHT"]), ["UNI", "RAC", "SHT"])
assert.deepEqual(pathsToward(shaTin, "EAL", "RAC"), [
  ["SHT", "RAC"],
  ["UNI", "RAC"],
])

const segment = segmentMinutes(metresBetween(places.A!, places.B!))
assert.ok(Math.abs(segment - 2) < 0.05)

const sameWay = runCollection([
  spotRun("lead", 1400),
  spotRun("rear", 0),
  spotRun("mid", 30),
  { ...spotRun("other", 0), dest: "A" },
], locate)
assert.equal(sameWay.features.length, 3)
assert.deepEqual(sameWay.features.map((feature) => feature.properties?.id).sort(), ["lead", "mid", "other"])

places.H1 = { lng: 114, lat: latNorth(0) }
places.H2 = { lng: 114, lat: latNorth(800) }
places.H3 = { lng: 114, lat: latNorth(30) }
const bend = runCollection([
  { ...spotRun("out", 20), path: ["H1", "H2", "H3"], dest: "H3" },
  { ...spotRun("back", 1540), path: ["H1", "H2", "H3"], dest: "H3" },
], locate)
assert.equal(bend.features.length, 2)

const railBend = [
  [places.A!.lng, places.A!.lat],
  [places.A!.lng + 0.008, ((places.A!.lat ?? 0) + (places.B!.lat ?? 0)) / 2],
  [places.B!.lng, places.B!.lat],
]
useTrackEdges({ "A>B": railBend })
const onBend = projectTrain({ ...obsTrain("B", "C", 1), path: ["A", "B", "C"], hold: ["A", "B", "C"] }, locate, now)
assert.ok(onBend)
assert.equal(onBend.from, "A")
assert.equal(onBend.to, "B")
assert.ok(onBend.lng > places.A!.lng + 0.001)
useTrackEdges({})

const first = asFeed(estimateTrains(line, [obs("C", "C", 80, 80)], locate))
let parked = runsFromTrains(first, locate, () => "#111", now)
assert.equal(parked.length, 1)
assert.equal(parked[0]?.speed, 0)
assert.equal(parked[0]?.distance, 0)
assert.equal(parked[0]?.plat, "")
assert.equal(parked[0]?.clamp, "origin")
for (let second = 1; second <= 70; second += 1) {
  parked = advanceRuns(parked, 1, locate)
  if (second % 15 === 0) {
    const again = runsFromTrains(first, locate, () => "#111", now + second * 1000)
    parked = mergeRuns(parked, again, now + second * 1000, locate)
  }
}
assert.equal(parked[0]?.distance, 0)
assert.equal(parked[0]?.speed, 0)
const parkedDot = runCollection(parked, locate).features[0]
assert.equal(parkedDot?.properties?.standing, "Y")
assert.equal(parkedDot?.properties?.from, "A")
assert.equal(parkedDot?.properties?.to, "A")
assert.equal(parkedDot?.properties?.next, "B")
assert.equal(parkedDot?.properties?.clamp, "origin")
const parkedMinutes = Number(parkedDot?.properties?.minutes)
assert.ok(parkedMinutes >= 78 && parkedMinutes <= 80, `parked minutes ${parkedMinutes}`)
assert.equal(parkedDot?.geometry && parkedDot.geometry.type === "Point" ? parkedDot.geometry.coordinates[1] : null, places.A?.lat)

const waitingHere = asFeed(estimateTrains(line, [obs("A", "C", 80, 80)], locate))
const posted = runsFromTrains(waitingHere, locate, () => "#111", now)
assert.equal(posted[0]?.plat, "1")
assert.equal(posted[0]?.clamp, "origin")

const drifted = mergeRuns([{ ...(parked[0] ?? sampleRun(800, 12)), distance: 800, speed: 12 }], posted, now + 1000, locate)
assert.equal(drifted[0]?.distance, 0)
assert.equal(drifted[0]?.speed, 0)

const service = asFeed(estimateTrains(line, [obs("B", "C", 1, 1), obs("C", "C", 3, 3)], locate))
const rolling = runsFromTrains(service, locate, () => "#111", now)
const leaving = mergeRuns(posted, rolling, now + 1000, locate)
assert.equal(leaving.length, 1)
assert.ok((leaving[0]?.speed ?? 0) > 0)
assert.equal(leaving[0]?.distance, rolling[0]?.distance)
assert.equal(leaving[0]?.id, posted[0]?.id)

assert.ok((rolling[0]?.speed ?? 0) > 3)
const before = rolling[0]?.distance ?? 0
const moved = advanceRuns(rolling, 5, locate)
assert.ok((moved[0]?.distance ?? 0) > before + 20)
const rollingDot = runCollection(moved, locate).features[0]
assert.equal(rollingDot?.properties?.standing, "N")
assert.notEqual(rollingDot?.properties?.from, rollingDot?.properties?.to)

console.log("mtr estimate ok")

function asFeed(trains: EstimatedTrain[]) {
  return trains.map((train) => ({ ...train, observedAt: new Date(train.observedAt).toISOString() }))
}

function sampleRun(distance: number, speed: number): TrainRun {
  return {
    id: "keep",
    line: "TML",
    dest: "C",
    path: ["A", "B", "C"],
    distance,
    speed,
    cruise: speed,
    color: "#000",
    plat: "1",
    delay: false,
    timeType: "A",
    seenAt: now,
    wait: null,
    clamp: "none",
  }
}

function obsTrain(station: string, dest: string, ttnt: number): EstimatedTrain {
  return {
    id: "t",
    line: "TML",
    dest,
    plat: "1",
    ttnt,
    observedAt: now,
    delay: false,
    timeType: "A",
    anchor: station,
    path: ["A", "B", "C"],
    hold: ["A", "B", "C"],
  }
}

function obs(
  station: string,
  dest: string,
  ttnt: number,
  dueMinutes: number,
  lineCode = "TML",
): TrainObservation {
  return {
    line: lineCode,
    station,
    dest,
    plat: "1",
    ttnt,
    dueAt: now + dueMinutes * 60_000,
    observedAt: now,
    delay: false,
    timeType: "A",
    viaRacecourse: false,
  }
}

function routes(lineCode: string, legs: [string, string[]][]): EstimateRoute[] {
  return legs.map(([direction, stations]) => ({ id: `${lineCode}-${direction}`, line: lineCode, stations }))
}

function spotRun(id: string, distance: number): TrainRun {
  return {
    id,
    line: "TCL",
    dest: "C",
    path: ["A", "B", "C"],
    distance,
    speed: 12,
    cruise: 12,
    color: "#f80",
    plat: "1",
    delay: false,
    timeType: "A",
    seenAt: now,
    wait: null,
    clamp: "none",
  }
}

function place(code: string, metresNorth: number) {
  places[code] = { lng: 114, lat: latNorth(metresNorth) }
}

function latNorth(metres: number): number {
  let delta = metres / 111_320
  const origin = 22.2
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const got = metresBetween({ lng: 114, lat: origin }, { lng: 114, lat: origin + delta })
    if (got === 0) break
    delta *= metres / got
  }
  return origin + delta
}

function locate(code: string): GeoPoint | null {
  return places[code] ?? null
}

function midpoint(from: string, to: string): number {
  return ((places[from]?.lat ?? 0) + (places[to]?.lat ?? 0)) / 2
}
