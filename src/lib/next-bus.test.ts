import assert from "node:assert/strict"
import { nextBus } from "./next-bus.ts"

const now = Date.parse("2026-10-13T15:07:00Z")

const passed = nextBus([
  { eta: "2026-10-13T15:07:00+08:00", remarkTc: "", remarkEn: "" },
], Date.parse("2026-10-13T15:46:00Z"))
assert.equal(passed.minutes, null)
assert.equal(passed.remarkTc, "")

const later = nextBus([
  { eta: "2026-10-13T23:07:00+08:00" },
  { eta: "2026-10-13T23:20:00+08:00" },
], Date.parse("2026-10-13T23:10:00+08:00"))
assert.equal(later.minutes, 10)
assert.equal(later.index, 1)

const gone = nextBus([
  { eta: null, remarkTc: "最後班次已過", remarkEn: "The final bus has departed from this stop" },
], now)
assert.equal(gone.minutes, null)
assert.equal(gone.remarkTc, "最後班次已過")

const scheduled = nextBus([
  { eta: "2026-10-14T00:23:00+08:00", scheduled: true, remarkTc: "原定班次", remarkEn: "Scheduled Bus" },
], Date.parse("2026-10-13T23:46:00+08:00"))
assert.equal(scheduled.scheduled, true)
assert.equal(scheduled.minutes, 37)
assert.equal(scheduled.remarkTc, "")

const due = nextBus([{ eta: "2026-10-13T23:46:12+08:00" }], Date.parse("2026-10-13T23:46:00+08:00"))
assert.equal(due.minutes, 0)

console.log("next-bus")
