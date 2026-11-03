import assert from "node:assert/strict"
import { OPENING_GIVE_UP_MS, OPENING_SETTLE_MS, openingTour, roadsAreDrawn } from "./opening-tour.ts"

assert.equal(OPENING_SETTLE_MS, 700)
assert.equal(OPENING_GIVE_UP_MS, 8_000)
assert.equal(roadsAreDrawn([]), false)
assert.equal(roadsAreDrawn([{ coordinates: [[114, 22]] }]), false)
assert.equal(
  roadsAreDrawn([
    { coordinates: [[114.1, 22.2], [114.2, 22.3]] },
  ]),
  true,
)

assert.equal(openingTour(false, false, 0), "now")
assert.equal(openingTour(true, false, 0), "wait")
assert.equal(openingTour(true, false, OPENING_GIVE_UP_MS - 1), "wait")
assert.equal(openingTour(true, false, OPENING_GIVE_UP_MS), "now")
assert.equal(openingTour(true, true, 0), "settle")
assert.equal(openingTour(true, true, OPENING_GIVE_UP_MS), "settle")

console.log("opening tour ok")
