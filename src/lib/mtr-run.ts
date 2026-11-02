import { metresBetween, projectTrain, segmentMinutes, type GeoPoint, type TrainSpot } from "./mtr-estimate.ts"
import { mixOnSpan, pointOnSpan, segmentLength } from "./rail-tracks.ts"
import type { MtrTrain } from "./types.ts"

export type TrainRun = {
  id: string
  line: string
  dest: string
  path: string[]
  distance: number
  speed: number
  cruise: number
  color: string
  plat: string
  delay: boolean
  timeType: "A" | "D"
  seenAt: number
  wait: number | null
  clamp: TrainSpot["clamp"]
}

const MATCH_METRES = 1500
const COAST_MS = 20_000
const MAX_SPEED = 20
const SAME_SPOT_M = 200

let nextRunId = 1

export function runsFromTrains(
  trains: MtrTrain[],
  locate: (code: string) => GeoPoint | null,
  colorOf: (line: string) => string,
  now: number,
): TrainRun[] {
  const runs: TrainRun[] = []
  for (const train of trains) {
    const observedAt = Date.parse(train.observedAt)
    if (!Number.isFinite(observedAt)) continue
    const spot = projectTrain({ ...train, observedAt }, locate, now)
    if (!spot) continue
    const distance = distanceOfSpot(train.path, spot, locate)
    const rolling = cruiseAt(train.path, distance, locate)
    // A countdown that still places the train at a station is not a train on the move.
    const standing = spot.from === spot.to
    const id = nextRunId
    nextRunId += 1
    runs.push({
      id: `run-${train.line}-${train.dest}-${id}`,
      line: train.line,
      dest: train.dest,
      path: train.path,
      distance,
      speed: standing ? 0 : rolling,
      cruise: standing ? 0 : rolling,
      color: colorOf(train.line),
      plat: standing && spot.from !== train.anchor ? "" : train.plat,
      delay: train.delay,
      timeType: train.timeType,
      seenAt: now,
      wait: standing ? Math.max(0, spot.minutes) : null,
      clamp: standing ? spot.clamp : "none",
    })
  }
  return runs
}

export function advanceRuns(runs: TrainRun[], dtSec: number, locate: (code: string) => GeoPoint | null): TrainRun[] {
  const dt = Math.max(0, dtSec)
  return runs.map((run) => {
    if (run.speed <= 0) {
      const wait = run.wait == null ? null : Math.max(0, run.wait - dt / 60)
      return { ...run, speed: 0, wait }
    }
    const end = pathEnd(run.path, locate)
    const distance = Math.min(end, run.distance + run.speed * dt)
    const cruise = cruiseAt(run.path, distance, locate)
    const arrived = distance >= end - 1
    return {
      ...run,
      distance,
      cruise: arrived ? 0 : cruise,
      speed: arrived ? 0 : cruise,
      wait: null,
      clamp: "none",
    }
  })
}

type PlacedRun = { run: TrainRun; aim: number | null }

export function mergeRuns(
  previous: TrainRun[],
  incoming: TrainRun[],
  now: number,
  locate?: (code: string) => GeoPoint | null,
): TrainRun[] {
  const used = new Set<number>()
  const kept: PlacedRun[] = []
  for (const run of previous) {
    let best = -1
    let bestGap = MATCH_METRES
    incoming.forEach((item, index) => {
      if (used.has(index) || item.line !== run.line || item.dest !== run.dest || item.path.join(">") !== run.path.join(">")) return
      const gap = Math.abs(item.distance - run.distance)
      if (gap < bestGap) {
        best = index
        bestGap = gap
      }
    })
    if (best < 0) {
      if (now - run.seenAt < COAST_MS) kept.push({ run, aim: null })
      continue
    }
    used.add(best)
    const item = incoming[best]
    if (!item) continue
    if (item.speed <= 0 || run.speed <= 0) {
      kept.push({
        run: {
          ...item,
          id: run.id,
          seenAt: now,
        },
        aim: item.distance,
      })
      continue
    }
    const ahead = item.distance - run.distance
    const rolling = item.cruise > 0 ? item.cruise : item.speed
    const speed = ahead > 30 ? Math.min(MAX_SPEED, Math.max(rolling, ahead / 30)) : rolling
    kept.push({
      run: {
        ...run,
        speed,
        cruise: rolling,
        wait: null,
        clamp: "none",
        plat: item.plat,
        delay: item.delay,
        timeType: item.timeType,
        seenAt: now,
      },
      aim: item.distance,
    })
  }
  incoming.forEach((item, index) => {
    if (!used.has(index)) kept.push({ run: item, aim: item.distance })
  })
  if (locate) splitPiledRuns(kept, locate)
  return kept.map((item) => item.run)
}

const PILE_M = 40

function splitPiledRuns(kept: PlacedRun[], locate: (code: string) => GeoPoint | null) {
  const place = kept.map((item) => placeRun(item.run, locate))
  const aimPlace = kept.map((item) => (item.aim === null ? null : placeRun({ ...item.run, distance: item.aim }, locate)))
  for (let i = 0; i < kept.length; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      const left = kept[i]
      const right = kept[j]
      const here = place[i]
      const there = place[j]
      const aimHere = aimPlace[i]
      const aimThere = aimPlace[j]
      if (!left || !right || !here || !there || !aimHere || !aimThere || left.aim === null || right.aim === null) continue
      if (left.run.line !== right.run.line) continue
      if (metresBetween(here, there) >= PILE_M || metresBetween(aimHere, aimThere) < PILE_M) continue
      left.run = { ...left.run, distance: left.aim }
      right.run = { ...right.run, distance: right.aim }
      place[i] = aimHere
      place[j] = aimThere
    }
  }
}

export function runCollection(
  runs: TrainRun[],
  locate: (code: string) => GeoPoint | null,
): GeoJSON.FeatureCollection {
  const drawn: { run: TrainRun; place: Placed }[] = []
  for (const run of runs) {
    const place = placeRun(run, locate)
    if (!place) continue
    const stacked = drawn.find((item) => sameService(item.run, item.place, run, place))
    if (stacked) {
      if (run.distance > stacked.run.distance) {
        stacked.run = run
        stacked.place = place
      }
      continue
    }
    drawn.push({ run, place })
  }
  spreadQueuedRoutes(drawn, locate)
  const features: GeoJSON.Feature[] = drawn.map(({ run, place }) => ({
    type: "Feature",
    properties: {
      id: run.id,
      color: run.color,
      line: run.line,
      dest: run.dest,
      plat: run.plat,
      delay: run.delay ? "Y" : "N",
      timeType: run.timeType,
      from: place.from,
      to: place.standing ? place.from : place.to,
      next: place.standing && place.to !== place.from ? place.to : "",
      standing: place.standing ? "Y" : "N",
      clamp: place.clamp,
      minutes: Math.round(place.minutes),
    },
    geometry: { type: "Point", coordinates: [place.lng, place.lat] },
  }))
  return { type: "FeatureCollection", features }
}

const QUEUE_STEP_M = 70

// Several routes can be walked back onto one terminus because the next stop is
// only a few hundred metres away. Step each later route along the outbound
// track so the markers and their labels do not sit on the same pixel.
function spreadQueuedRoutes(
  drawn: { run: TrainRun; place: Placed }[],
  locate: (code: string) => GeoPoint | null,
): void {
  const used = new Set<number>()
  for (let i = 0; i < drawn.length; i += 1) {
    if (used.has(i)) continue
    const seed = drawn[i]
    if (!seed || seed.place.clamp !== "origin" || !seed.place.standing) continue
    const group = [i]
    for (let j = i + 1; j < drawn.length; j += 1) {
      const other = drawn[j]
      if (!other || other.place.clamp !== "origin" || !other.place.standing) continue
      if (other.run.line === seed.run.line) continue
      if (metresBetween(seed.place, other.place) >= PILE_M) continue
      group.push(j)
    }
    if (group.length < 2) continue
    for (const index of group) used.add(index)
    group.sort((a, b) => {
      const left = drawn[a]?.run.line ?? ""
      const right = drawn[b]?.run.line ?? ""
      return left < right ? -1 : left > right ? 1 : 0
    })
    group.forEach((index, order) => {
      const item = drawn[index]
      if (!item || order === 0) return
      const shifted = shiftAlong(item.place, item.run, locate, order * QUEUE_STEP_M)
      if (!shifted) return
      item.place = { ...item.place, lng: shifted.lng, lat: shifted.lat }
    })
  }
}

function shiftAlong(
  place: Placed,
  run: TrainRun,
  locate: (code: string) => GeoPoint | null,
  metres: number,
): GeoPoint | null {
  const next = place.to !== place.from ? place.to : run.path[run.path.indexOf(place.from) + 1]
  if (!next) return null
  const start = locate(place.from)
  const end = locate(next)
  if (!start || !end) return null
  const length = segmentLength(place.from, next, start, end)
  if (length <= 1) return null
  return pointOnSpan(place.from, next, start, end, Math.min(0.85, metres / length))
}

function sameService(
  left: TrainRun,
  leftPlace: { lng: number; lat: number },
  right: TrainRun,
  rightPlace: { lng: number; lat: number },
): boolean {
  if (left.line !== right.line || left.dest !== right.dest) return false
  if (left.path.join(">") === right.path.join(">")) return Math.abs(left.distance - right.distance) < SAME_SPOT_M
  return metresBetween(leftPlace, rightPlace) < SAME_SPOT_M
}

type Placed = {
  lng: number
  lat: number
  from: string
  to: string
  minutes: number
  standing: boolean
  clamp: TrainSpot["clamp"]
}

function placeRun(run: TrainRun, locate: (code: string) => GeoPoint | null): Placed | null {
  const cum = cumulative(run.path, locate)
  const end = cum[cum.length - 1] ?? 0
  const distance = Math.max(0, Math.min(end, run.distance))
  if (run.speed <= 0) {
    const parked = stationAt(run.path, distance, cum, locate)
    if (!parked) return null
    return {
      lng: parked.point.lng,
      lat: parked.point.lat,
      from: parked.here,
      to: parked.next,
      minutes: run.wait ?? 0,
      standing: true,
      clamp: run.clamp,
    }
  }
  let index = 0
  while (index < cum.length - 2 && (cum[index + 1] ?? 0) < distance) index += 1
  const here = run.path[index]
  const next = run.path[index + 1]
  const start = here ? locate(here) : null
  if (!here || !start) return null
  if (!next || index >= cum.length - 1) {
    return { lng: start.lng, lat: start.lat, from: here, to: here, minutes: 0, standing: true, clamp: "none" }
  }
  const finish = locate(next)
  const seg = (cum[index + 1] ?? 0) - (cum[index] ?? 0)
  if (!finish || seg <= 1) {
    return { lng: start.lng, lat: start.lat, from: here, to: here, minutes: 0, standing: true, clamp: "none" }
  }
  const along = distance - (cum[index] ?? 0)
  const mix = Math.min(1, Math.max(0, along / seg))
  const point = pointOnSpan(here, next, start, finish, mix)
  const minutesLeft = ((seg - along) / run.speed) / 60
  return {
    lng: point.lng,
    lat: point.lat,
    from: here,
    to: next,
    minutes: minutesLeft,
    standing: false,
    clamp: "none",
  }
}

function stationAt(
  path: string[],
  distance: number,
  cum: number[],
  locate: (code: string) => GeoPoint | null,
): { here: string; next: string; point: GeoPoint } | null {
  let index = 0
  while (index < path.length - 1 && (cum[index + 1] ?? 0) <= distance + 1) index += 1
  const here = path[index]
  const next = path[index + 1] ?? here
  const point = here ? locate(here) : null
  if (!here || !next || !point) return null
  return { here, next, point }
}

function distanceOfSpot(
  path: string[],
  spot: { lng: number; lat: number; from: string; to: string },
  locate: (code: string) => GeoPoint | null,
): number {
  const cum = cumulative(path, locate)
  const index = path.indexOf(spot.from)
  if (index < 0) return 0
  if (spot.from === spot.to || path[index + 1] !== spot.to) return cum[index] ?? 0
  const start = locate(spot.from)
  const end = locate(spot.to)
  const seg = start && end ? segmentLength(spot.from, spot.to, start, end) : 0
  const frac = start && end ? mixOnSpan(spot.from, spot.to, start, end, spot) : 0
  return (cum[index] ?? 0) + frac * seg
}

function cruiseAt(path: string[], distance: number, locate: (code: string) => GeoPoint | null): number {
  const cum = cumulative(path, locate)
  const end = cum[cum.length - 1] ?? 0
  if (distance >= end - 1) return 0
  let index = 0
  while (index < cum.length - 2 && (cum[index + 1] ?? 0) <= distance) index += 1
  const seg = (cum[index + 1] ?? 0) - (cum[index] ?? 0)
  if (seg <= 1) return 0
  return seg / (segmentMinutes(seg) * 60)
}

function pathEnd(path: string[], locate: (code: string) => GeoPoint | null): number {
  const cum = cumulative(path, locate)
  return cum[cum.length - 1] ?? 0
}

function cumulative(path: string[], locate: (code: string) => GeoPoint | null): number[] {
  const cum = [0]
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]
    const to = path[index]
    const start = from ? locate(from) : null
    const finish = to ? locate(to) : null
    const step = start && finish && from && to ? segmentLength(from, to, start, finish) : 0
    cum.push((cum[index - 1] ?? 0) + step)
  }
  return cum
}
