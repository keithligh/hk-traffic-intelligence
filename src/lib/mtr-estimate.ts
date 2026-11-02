import { mixOnSpan, pointOnSpan, segmentLength } from "./rail-tracks.ts"

// MTR publishes the minutes until a train reaches a station. It does not publish
// where that train is. A position is the countdown walked back along the station
// spacing: a short hop is about 43 km/h, a longer one about 65 km/h. Where two
// branches share a trunk and the board never says which branch, the walk stops
// at the junction instead of picking one.

const URBAN_METRES = 1500
const URBAN_SPEED_MPS = 12
const OPEN_SPEED_MPS = 18
const MIN_SEGMENT_MIN = 0.8
const MAX_SEGMENT_MIN = 8
// One hop may be a minute off the spacing model. A wider match glues the
// following Tsuen Wan train, about two minutes behind, onto the one in front.
const HOP_TOLERANCE_MS = 75_000
// The arrival board does not say when the train leaves. Half a minute is the stop
// after a 0-minute reading, then the train runs the next spacing. A published
// departure time is the leave time, so that one does not add a stop.
const ARRIVAL_DWELL_MIN = 0.5
const ZERO_CLOCK_MAX_MS = 4 * 60_000

export type GeoPoint = { lng: number; lat: number }

export type EstimateRoute = {
  id: string
  line: string
  stations: string[]
}

export type TrainObservation = {
  line: string
  station: string
  dest: string
  plat: string
  ttnt: number
  dueAt: number
  observedAt: number
  delay: boolean
  timeType: "A" | "D"
  viaRacecourse: boolean
}

export type EstimatedTrain = {
  id: string
  line: string
  dest: string
  plat: string
  ttnt: number
  observedAt: number
  delay: boolean
  timeType: "A" | "D"
  anchor: string
  path: string[]
  hold: string[]
}

export type TrainSpot = {
  lng: number
  lat: number
  from: string
  to: string
  clamp: "none" | "origin" | "junction"
  minutes: number
}

type IndexedObservation = TrainObservation & { index: number }

type Chain = {
  path: string[]
  items: IndexedObservation[]
}

export function metresBetween(a: GeoPoint, b: GeoPoint): number {
  const radius = 6_371_000
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function segmentMinutes(metres: number): number {
  const speed = metres < URBAN_METRES ? URBAN_SPEED_MPS : OPEN_SPEED_MPS
  return Math.min(MAX_SEGMENT_MIN, Math.max(MIN_SEGMENT_MIN, metres / speed / 60))
}

export function pathsToward(routes: EstimateRoute[], line: string, dest: string): string[][] {
  if (line === "EAL" && dest === "RAC") return racecoursePaths(routes)
  const found: string[][] = []
  const seen = new Set<string>()
  for (const route of routes) {
    if (route.line !== line) continue
    const destIndex = route.stations.indexOf(dest)
    if (destIndex < 0) continue
    const path = route.stations.slice(0, destIndex + 1)
    const key = path.join(">")
    if (seen.has(key)) continue
    seen.add(key)
    found.push(path)
  }
  return dropSuffixPaths(found)
}

export function viaRacecourse(path: string[]): string[] {
  const next = path.slice()
  const foTan = next.indexOf("FOT")
  if (foTan < 0) return next
  const previous = next[foTan - 1]
  const follow = next[foTan + 1]
  const betweenShaTinAndUniversity =
    (previous === "SHT" && follow === "UNI") || (previous === "UNI" && follow === "SHT")
  if (!betweenShaTinAndUniversity) return next
  next[foTan] = "RAC"
  return next
}

export function estimateTrains(
  routes: EstimateRoute[],
  observations: TrainObservation[],
  locate: (code: string) => GeoPoint | null,
): EstimatedTrain[] {
  const groups = new Map<string, TrainObservation[]>()
  for (const item of dedupe(observations)) {
    if (!locate(item.station)) continue
    const key = `${item.line}|${item.dest}|${item.viaRacecourse ? "1" : "0"}`
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }

  const trains: EstimatedTrain[] = []
  let serial = 0
  for (const [key, items] of groups) {
    const [line, dest, viaFlag] = key.split("|")
    if (!line || !dest) continue
    let paths = pathsToward(routes, line, dest)
    if (viaFlag === "1") paths = uniquePaths(paths.map(viaRacecourse))
    paths = dropSuffixPaths(paths)
    if (paths.length === 0) continue
    const shared = intersection(paths)
    for (const chain of chainObservations(paths, items, locate)) {
      const anchor = pickAnchor(chain, shared, locate)
      if (!anchor) continue
      const branched = chain.items.some((item) => !shared.has(item.station))
      const hold = branched ? [...new Set(chain.path)] : [...shared]
      if (!hold.includes(anchor.station)) hold.push(anchor.station)
      trains.push({
        id: `${line}-${dest}-${anchor.station}-${serial}`,
        line,
        dest,
        plat: anchor.plat,
        ttnt: anchor.ttnt,
        observedAt: anchor.observedAt,
        delay: chain.items.some((item) => item.delay),
        timeType: anchor.timeType,
        anchor: anchor.station,
        path: chain.path,
        hold,
      })
      serial += 1
    }
  }
  return separateArrivals(enteredService(trains, locate), locate)
}

export function projectTrain(train: EstimatedTrain, locate: (code: string) => GeoPoint | null, atMs: number): TrainSpot | null {
  const elapsed = Math.max(0, (atMs - train.observedAt) / 60_000)
  const untilEvent = train.ttnt - elapsed
  const anchorPoint = locate(train.anchor)
  if (!anchorPoint) return null
  if (train.timeType === "D") {
    if (untilEvent > 0) return atPoint(anchorPoint, train.anchor, untilEvent)
    return rideForward(train, locate, -untilEvent) ?? atPoint(anchorPoint, train.anchor, 0)
  }
  if (untilEvent > 0) return approachStation(train, locate, untilEvent, anchorPoint)
  const sinceArrival = -untilEvent
  if (sinceArrival < ARRIVAL_DWELL_MIN) return atPoint(anchorPoint, train.anchor, 0)
  return rideForward(train, locate, sinceArrival - ARRIVAL_DWELL_MIN) ?? atPoint(anchorPoint, train.anchor, 0)
}

export function carryArrivalClock(previous: TrainObservation[], next: TrainObservation[]): TrainObservation[] {
  return next.map((item) => {
    if (item.ttnt !== 0 || item.timeType === "D") return item
    const prior = previous.find(
      (old) =>
        old.ttnt === 0 &&
        old.timeType !== "D" &&
        old.line === item.line &&
        old.station === item.station &&
        old.dest === item.dest &&
        old.plat === item.plat,
    )
    if (!prior || prior.observedAt >= item.observedAt) return item
    if (item.observedAt - prior.observedAt > ZERO_CLOCK_MAX_MS) return item
    return { ...item, observedAt: prior.observedAt, dueAt: prior.observedAt }
  })
}

function approachStation(
  train: EstimatedTrain,
  locate: (code: string) => GeoPoint | null,
  minutes: number,
  anchorPoint: GeoPoint,
): TrainSpot {
  const hold = new Set(train.hold)
  let at = train.path.indexOf(train.anchor)
  if (at < 0) return { ...atPoint(anchorPoint, train.anchor, minutes), clamp: "junction" }
  let remain = minutes
  while (at > 0) {
    const previous = train.path[at - 1]
    const here = train.path[at]
    if (!previous || !here || !hold.has(previous)) break
    const start = locate(previous)
    const end = locate(here)
    if (!start || !end) break
    const segment = segmentMinutes(segmentLength(previous, here, start, end))
    if (remain <= segment) {
      const mix = segment <= 0 ? 1 : 1 - remain / segment
      const point = pointOnSpan(previous, here, start, end, mix)
      return { lng: point.lng, lat: point.lat, from: previous, to: here, clamp: "none", minutes: remain }
    }
    remain -= segment
    at -= 1
  }
  const code = train.path[at] ?? train.anchor
  const point = locate(code) ?? anchorPoint
  const clamp = remain > 0.05 ? (code === train.path[0] ? "origin" : "junction") : "none"
  return { lng: point.lng, lat: point.lat, from: code, to: code, clamp, minutes: Math.max(0, minutes) }
}

function rideForward(
  train: EstimatedTrain,
  locate: (code: string) => GeoPoint | null,
  travelMin: number,
): TrainSpot | null {
  const hold = new Set(train.hold)
  let index = train.path.indexOf(train.anchor)
  const anchorPoint = locate(train.anchor)
  if (index < 0 || !anchorPoint || travelMin <= 0) return null
  let remain = travelMin
  while (index < train.path.length - 1) {
    const here = train.path[index]
    const next = train.path[index + 1]
    if (!here || !next || !hold.has(next)) break
    const start = locate(here)
    const end = locate(next)
    if (!start || !end) break
    const segment = segmentMinutes(segmentLength(here, next, start, end))
    if (remain <= segment) {
      const mix = segment <= 0 ? 1 : remain / segment
      const point = pointOnSpan(here, next, start, end, mix)
      return { lng: point.lng, lat: point.lat, from: here, to: next, clamp: "none", minutes: Math.max(0, segment - remain) }
    }
    remain -= segment
    index += 1
  }
  const code = train.path[index] ?? train.anchor
  const point = locate(code)
  if (!point) return null
  const held = index < train.path.length - 1
  return { lng: point.lng, lat: point.lat, from: code, to: code, clamp: held ? "junction" : "none", minutes: 0 }
}

function atPoint(point: GeoPoint, code: string, minutes: number): TrainSpot {
  return { lng: point.lng, lat: point.lat, from: code, to: code, clamp: "none", minutes: Math.max(0, minutes) }
}

const PILE_M = 40

// A junction used to pin every unmatched arrival to the same station. The clocks
// still differed, but the dots left together at one speed. Walk each clock back
// along the path it already has. A later train with nowhere to stand is not drawn
// on top of the earlier one.
function separateArrivals(trains: EstimatedTrain[], locate: (code: string) => GeoPoint | null): EstimatedTrain[] {
  const opened = trains.map((train) => ({ train: { ...train, hold: [...train.hold] }, spot: projectTrain(train, locate, train.observedAt) }))
  for (let i = 0; i < opened.length; i++) {
    const left = opened[i]
    if (!left?.spot || left.spot.from !== left.spot.to) continue
    const pile = [i]
    for (let j = i + 1; j < opened.length; j++) {
      const right = opened[j]
      if (!right?.spot || right.spot.from !== right.spot.to || left.train.line !== right.train.line) continue
      if (metresBetween(left.spot, right.spot) >= PILE_M) continue
      pile.push(j)
    }
    if (pile.length < 2) continue
    for (const index of pile) {
      const train = opened[index]?.train
      if (!train || train.timeType === "D") continue
      const at = train.path.indexOf(train.anchor)
      if (at <= 0) continue
      const hold = new Set(train.hold)
      if (train.path.slice(0, at).every((code) => hold.has(code))) continue
      train.hold = [...new Set(train.path)]
    }
  }
  const revised = opened.map((item) => ({ train: item.train, spot: projectTrain(item.train, locate, item.train.observedAt) }))
  const drop = new Set<number>()
  for (let i = 0; i < revised.length; i++) {
    if (drop.has(i)) continue
    const left = revised[i]
    if (!left?.spot || left.spot.from !== left.spot.to) continue
    for (let j = i + 1; j < revised.length; j++) {
      if (drop.has(j)) continue
      const right = revised[j]
      if (!right?.spot || right.spot.from !== right.spot.to) continue
      if (metresBetween(left.spot, right.spot) >= PILE_M) continue
      if (left.train.ttnt === right.train.ttnt) continue
      // A short Light Rail hop is under a minute, so every route that has not
      // reached the next stop is walked back to the same terminus. Those are
      // different vehicles. Drop a later one only when it is the same route,
      // or when both trains are actually called at this station.
      const sameLine = left.train.line === right.train.line
      const bothCalledHere = left.spot.from === left.train.anchor && right.spot.from === right.train.anchor
      if (!sameLine && !bothCalledHere) continue
      const later = left.train.ttnt > right.train.ttnt ? i : j
      drop.add(later)
      if (later === i) break
    }
  }
  return collapseSameService(revised.filter((_, index) => !drop.has(index)).map((item) => item.train), locate)
}

const SAME_SERVICE_M = 200

// Two estimates of one train can still land on top of each other when the
// station chain missed the link. A real following train is minutes apart.
function collapseSameService(trains: EstimatedTrain[], locate: (code: string) => GeoPoint | null): EstimatedTrain[] {
  const placed = trains.map((train) => ({ train, spot: projectTrain(train, locate, train.observedAt) }))
  const drop = new Set<number>()
  for (let i = 0; i < placed.length; i++) {
    if (drop.has(i)) continue
    const left = placed[i]
    if (!left?.spot) continue
    for (let j = i + 1; j < placed.length; j++) {
      if (drop.has(j)) continue
      const right = placed[j]
      if (!right?.spot || left.train.line !== right.train.line || left.train.dest !== right.train.dest) continue
      if (metresBetween(left.spot, right.spot) >= SAME_SERVICE_M) continue
      const later = serviceRank(left.train, left.spot, locate) >= serviceRank(right.train, right.spot, locate) ? j : i
      drop.add(later)
      if (later === i) break
    }
  }
  return placed.filter((_, index) => !drop.has(index)).map((item) => item.train)
}

function serviceRank(train: EstimatedTrain, spot: TrainSpot, locate: (code: string) => GeoPoint | null): number {
  const moving = spot.from !== spot.to ? 1_000_000 : 0
  return moving + metresAlong(train, spot, locate) - train.ttnt
}

function metresAlong(train: EstimatedTrain, spot: TrainSpot, locate: (code: string) => GeoPoint | null): number {
  let metres = 0
  for (let index = 1; index < train.path.length; index += 1) {
    const from = train.path[index - 1]
    const to = train.path[index]
    const start = from ? locate(from) : null
    const finish = to ? locate(to) : null
    const step = start && finish && from && to ? segmentLength(from, to, start, finish) : 0
    if (from === spot.from && to === spot.to && start) {
      if (!finish || !to || step <= 0) return metres
      const along = step * mixOnSpan(from, to, start, finish, spot)
      return metres + Math.min(step, Math.max(0, along))
    }
    if (from === spot.from && spot.from === spot.to) return metres
    metres += step
  }
  return metres
}

function enteredService(
  trains: EstimatedTrain[],
  locate: (code: string) => GeoPoint | null,
): EstimatedTrain[] {
  const visible: EstimatedTrain[] = []
  const queued = new Map<string, EstimatedTrain>()
  for (const train of trains) {
    const spot = projectTrain(train, locate, train.observedAt)
    const origin = train.path[0]
    const waitingToEnter = Boolean(spot && origin && spot.clamp === "origin" && spot.from === origin)
    const laterDeparture = train.timeType === "D"
    if (!waitingToEnter && !laterDeparture) {
      visible.push(train)
      continue
    }
    const key = laterDeparture
      ? `${train.line}|${train.dest}|${train.anchor}|D`
      : `${train.line}|${train.dest}|${origin}|${train.path.join(">")}`
    const current = queued.get(key)
    if (!current || train.ttnt < current.ttnt) queued.set(key, train)
  }
  return [...visible, ...queued.values()]
}

function racecoursePaths(routes: EstimateRoute[]): string[][] {
  const found: string[][] = []
  const seen = new Set<string>()
  for (const route of routes) {
    if (route.line !== "EAL") continue
    const shaTin = route.stations.indexOf("SHT")
    const university = route.stations.indexOf("UNI")
    if (shaTin < 0 || university < 0) continue
    const end = shaTin < university ? shaTin : university
    const path = [...route.stations.slice(0, end + 1), "RAC"]
    const key = path.join(">")
    if (seen.has(key)) continue
    seen.add(key)
    found.push(path)
  }
  return found
}

function chainObservations(
  paths: string[][],
  observations: TrainObservation[],
  locate: (code: string) => GeoPoint | null,
): Chain[] {
  const rows = observations.flatMap((item) => {
    const hits = paths.flatMap((path) => {
      const index = path.indexOf(item.station)
      return index < 0 ? [] : [{ path, index }]
    })
    return hits.length > 0 ? [{ item, hits }] : []
  })
  const exclusive = rows.filter((row) => row.hits.length === 1)
  const shared = rows.filter((row) => row.hits.length > 1)
  exclusive.sort((a, b) => compareHits(a.hits[0], a.item, b.hits[0], b.item))
  shared.sort((a, b) => {
    const aIndex = Math.min(...a.hits.map((hit) => hit.index))
    const bIndex = Math.min(...b.hits.map((hit) => hit.index))
    return aIndex - bIndex || a.item.dueAt - b.item.dueAt
  })

  const chains: Chain[] = []
  for (const row of exclusive) {
    const hit = row.hits[0]
    if (!hit) continue
    const indexed = { ...row.item, index: hit.index }
    if (!attach(chains, hit.path, indexed, locate)) chains.push({ path: hit.path, items: [indexed] })
  }
  for (const row of shared) {
    let best: { chain: Chain; index: number; err: number } | null = null
    for (const hit of row.hits) {
      for (const chain of chains) {
        if (chain.path !== hit.path) continue
        const last = chain.items[chain.items.length - 1]
        if (!last || last.index >= hit.index) continue
        const err = dueError(chain.path, last, hit.index, row.item.dueAt, locate)
        const gap = hit.index - last.index
        if (err <= HOP_TOLERANCE_MS * gap && (best === null || err < best.err)) {
          best = { chain, index: hit.index, err }
        }
      }
    }
    if (best) {
      best.chain.items.push({ ...row.item, index: best.index })
      continue
    }
    const chosen = preferredPath(row.hits)
    if (!chosen) continue
    chains.push({ path: chosen.path, items: [{ ...row.item, index: chosen.index }] })
  }
  return chains
}

function attach(chains: Chain[], path: string[], item: IndexedObservation, locate: (code: string) => GeoPoint | null): boolean {
  let best: Chain | null = null
  let bestErr = Infinity
  for (const chain of chains) {
    if (chain.path !== path) continue
    const last = chain.items[chain.items.length - 1]
    if (!last || last.index >= item.index) continue
    const err = dueError(path, last, item.index, item.dueAt, locate)
    const gap = item.index - last.index
    if (err <= HOP_TOLERANCE_MS * gap && err < bestErr) {
      best = chain
      bestErr = err
    }
  }
  if (!best) return false
  best.items.push(item)
  return true
}

function pickAnchor(chain: Chain, shared: Set<string>, locate: (code: string) => GeoPoint | null): IndexedObservation | null {
  const arrivals = chain.items.filter((item) => item.timeType !== "D")
  const departures = chain.items.filter((item) => item.timeType === "D")
  const soonestArrival = arrivals.reduce((min, item) => Math.min(min, item.ttnt), Infinity)
  const soonestDeparture = departures.reduce<IndexedObservation | null>(
    (best, item) => (!best || item.ttnt < best.ttnt ? item : best),
    null,
  )
  if (soonestDeparture && soonestDeparture.ttnt <= soonestArrival) return soonestDeparture

  const branched = chain.items.some((item) => !shared.has(item.station))
  const hold = branched ? [...new Set(chain.path)] : [...shared]
  let best: IndexedObservation | null = null
  let bestRank = -1
  for (const item of arrivals) {
    const probeHold = hold.includes(item.station) ? hold : [...hold, item.station]
    const rank = placementRank(chain.path, probeHold, item, locate)
    if (!best || rank > bestRank || (rank === bestRank && (item.ttnt < best.ttnt || (item.ttnt === best.ttnt && item.index > best.index)))) {
      best = item
      bestRank = rank
    }
  }
  return best ?? soonestDeparture
}

function placementRank(
  path: string[],
  hold: string[],
  item: IndexedObservation,
  locate: (code: string) => GeoPoint | null,
): number {
  const spot = projectTrain(
    {
      id: "probe",
      line: item.line,
      dest: item.dest,
      plat: item.plat,
      ttnt: item.ttnt,
      observedAt: item.observedAt,
      delay: item.delay,
      timeType: "A",
      anchor: item.station,
      path,
      hold,
    },
    locate,
    item.observedAt,
  )
  if (!spot) return 0
  if (spot.from !== spot.to) return 2
  if (spot.clamp === "none") return 1
  return 0
}

function dueError(
  path: string[],
  last: IndexedObservation,
  index: number,
  dueAt: number,
  locate: (code: string) => GeoPoint | null,
): number {
  let travelMs = 0
  for (let cursor = last.index; cursor < index; cursor += 1) {
    const from = path[cursor]
    const to = path[cursor + 1]
    const start = from ? locate(from) : null
    const end = to ? locate(to) : null
    const minutes = start && end && from && to ? segmentMinutes(segmentLength(from, to, start, end)) : 2
    travelMs += minutes * 60_000
  }
  return Math.abs(dueAt - (last.dueAt + travelMs))
}

function preferredPath(hits: { path: string[]; index: number }[]): { path: string[]; index: number } | null {
  const first = hits[0]
  if (!first) return null
  const shared = intersection(hits.map((hit) => hit.path))
  let best = first
  let bestScore = scorePath(first, shared)
  for (const hit of hits.slice(1)) {
    const score = scorePath(hit, shared)
    const shorter = hit.path.length < best.path.length
    if (score > bestScore || (score === bestScore && shorter)) {
      best = hit
      bestScore = score
    }
  }
  return best
}

function scorePath(hit: { path: string[]; index: number }, shared: Set<string>): number {
  let score = 0
  for (let index = 0; index <= hit.index; index += 1) {
    const code = hit.path[index]
    if (code && shared.has(code)) score += 1
  }
  return score
}

function compareHits(
  a: { path: string[]; index: number } | undefined,
  aItem: TrainObservation,
  b: { path: string[]; index: number } | undefined,
  bItem: TrainObservation,
): number {
  const aKey = a?.path.join(">") ?? ""
  const bKey = b?.path.join(">") ?? ""
  if (aKey !== bKey) return aKey < bKey ? -1 : 1
  return (a?.index ?? 0) - (b?.index ?? 0) || aItem.dueAt - bItem.dueAt
}

function intersection(paths: string[][]): Set<string> {
  const first = paths[0]
  if (!first) return new Set()
  const set = new Set(first)
  for (const path of paths.slice(1)) {
    for (const code of [...set]) {
      if (!path.includes(code)) set.delete(code)
    }
  }
  return set
}

function dropSuffixPaths(paths: string[][]): string[][] {
  return uniquePaths(paths).filter((path) => !paths.some((other) => other !== path && isSuffix(path, other)))
}

function uniquePaths(paths: string[][]): string[][] {
  const seen = new Set<string>()
  const unique: string[][] = []
  for (const path of paths) {
    const key = path.join(">")
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(path)
  }
  return unique
}

function isSuffix(short: string[], long: string[]): boolean {
  if (short.length === 0 || short.length >= long.length) return false
  const start = long.length - short.length
  for (let index = 0; index < short.length; index += 1) {
    if (long[start + index] !== short[index]) return false
  }
  return true
}

function dedupe(observations: TrainObservation[]): TrainObservation[] {
  const seen = new Set<string>()
  const unique: TrainObservation[] = []
  for (const item of observations) {
    const key = `${item.line}|${item.station}|${item.dest}|${item.viaRacecourse ? "1" : "0"}|${Math.round(item.dueAt / 30_000)}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
  }
  return unique
}
