import assert from "node:assert/strict"
import { loadPoleBoard } from "./pole-board.ts"

const now = 1_700_000_000_000
const here = { tc: "中港城", en: "City", lng: 114.168095, lat: 22.300341, routes: ["12", "HK1"] }

let fetches = 0
const first = await loadPoleBoard("pole:published", now, {
  poleIds: () => ["b", "a"],
  pole: (id) => ({ ...here, routes: id === "a" ? ["HK1"] : ["12"] }),
  jobs: (_id, pole) => pole.routes,
  rows: async (_id, route) => {
    fetches += 1
    return [{ route, minutes: route === "HK1" ? 4 : 11 }]
  },
  calls: (_id, _route, rows) => rows.map((row) => ({
    route: row.route,
    destTc: "尖沙咀",
    destEn: "Tsim Sha Tsui",
    minutes: row.minutes,
  })),
})
assert.equal(first.ok, true)
if (first.ok) {
  assert.equal(first.stop.id, "a")
  assert.deepEqual(first.stop.calls.map((call) => [call.route, call.minutes]), [["HK1", 4], ["12", 11]])
  assert.deepEqual(first.stop.routes, ["12", "HK1"])
}
const second = await loadPoleBoard("pole:published", now, {
  poleIds: () => ["a"],
  pole: () => here,
  jobs: () => ["again"],
  rows: async () => {
    fetches += 1
    return []
  },
  calls: () => [],
})
assert.equal(fetches, 2)
assert.equal(second.ok, true)
if (second.ok) assert.equal(second.stop.calls[0]?.route, "HK1")

let tries = 0
const missed = await loadPoleBoard("pole:miss", now, {
  poleIds: () => ["a"],
  pole: () => here,
  jobs: () => ["12"],
  rows: async () => {
    tries += 1
    return null
  },
  calls: () => [],
})
assert.equal(missed.ok, false)

const partial = await loadPoleBoard("pole:partial", now, {
  poleIds: () => ["near", "here"],
  pole: (id) => ({ ...here, routes: id === "here" ? ["12"] : ["99"] }),
  jobs: (_id, pole) => pole.routes,
  rows: async (_id, route) => (route === "99" ? null : [{ route, minutes: 6 }]),
  calls: (_id, _route, rows) => rows.map((row) => ({
    route: row.route,
    destTc: "中環",
    destEn: "Central",
    minutes: row.minutes,
  })),
})
assert.equal(partial.ok, true)
if (partial.ok) {
  assert.deepEqual(partial.stop.calls.map((call) => call.route), ["12"])
  assert.ok(partial.stop.routes.includes("99"))
}
const recovered = await loadPoleBoard<{ route: string }, { route: string; minutes: number }, { route: string; destTc: string; destEn: string; minutes: number | null }>("pole:miss", now, {
  poleIds: () => ["a"],
  pole: () => here,
  jobs: () => ["12"],
  rows: async () => {
    tries += 1
    return [{ route: "12", minutes: 3 }]
  },
  calls: (_id, _route, rows) => rows.map((row) => ({
    route: row.route,
    destTc: "中環",
    destEn: "Central",
    minutes: row.minutes,
  })),
})
assert.equal(tries, 2)
assert.equal(recovered.ok, true)
if (recovered.ok) assert.equal(recovered.stop.calls[0]?.minutes, 3)

const absent = await loadPoleBoard("pole:absent", now, {
  poleIds: () => [],
  pole: () => null,
  jobs: () => [],
  rows: async () => [],
  calls: () => [],
})
assert.equal(absent.ok, false)

const quiet = await loadPoleBoard("pole:quiet", now, {
  poleIds: () => ["003227"],
  pole: () => ({ tc: "新興花園", en: "Sun Hing", lng: 114.17256, lat: 22.4529, routes: ["307A"] }),
  jobs: (_id, pole) => pole.routes,
  rows: async () => [],
  calls: () => [],
})
assert.equal(quiet.ok, true)
if (quiet.ok) {
  assert.deepEqual(quiet.stop.calls, [])
  assert.deepEqual(quiet.stop.routes, ["307A"])
}

console.log("pole-board-ok")
