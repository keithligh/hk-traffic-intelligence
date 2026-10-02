import assert from "node:assert/strict"
import { harbourChoice, pickOrigin } from "./harbour-choice.ts"
import type { ApproachPoint } from "./types.ts"

const point = (id: string, legs: [string, number | null][]): ApproachPoint => ({
  id,
  name: id,
  nameTc: id,
  coordinates: [114.17, 22.28],
  legs: legs.map(([code, minutes]) => ({ code, name: code, minutes, colour: "green" })),
})

// Sorted fastest first, with the gap to the fastest tunnel.
const east = harbourChoice(point("H11", [["CH", 25], ["EH", 8]]))
assert.deepEqual(
  east.map((row) => [row.code, row.minutes, row.delta, row.fastest]),
  [
    ["EH", 8, 0, true],
    ["CH", 25, 17, false],
  ],
)

// Missing times and non-harbour legs are left out; ties share the fastest mark.
const tie = harbourChoice(point("K08", [["WH", 9], ["XX", 1], ["CH", null], ["EH", 9]]))
assert.deepEqual(
  tie.map((row) => [row.code, row.fastest]),
  [
    ["EH", true],
    ["WH", true],
  ],
)

assert.deepEqual(harbourChoice(point("none", [])), [])

const points = [point("H1", [["CH", 7], ["EH", 9]]), point("H2", [["CH", 7], ["EH", 9], ["WH", 12]])]
// A saved origin that still exists wins.
assert.equal(pickOrigin(points, "H1")?.id, "H1")
// Otherwise the start that reaches the most tunnels.
assert.equal(pickOrigin(points, "gone")?.id, "H2")
assert.equal(pickOrigin(points, null)?.id, "H2")
assert.equal(pickOrigin([], "H1"), null)

console.log("harbour choice ok")
