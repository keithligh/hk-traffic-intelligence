import assert from "node:assert/strict"
import { continueLiveRead, nextReading, readingForView, scheduleLiveRead } from "./last-reading.ts"

const kept = { ok: true, stops: ["HH650"] }
const failed = { ok: false, error: "Feed failed", stops: [] }
assert.equal(nextReading(null, failed), failed)
assert.equal(nextReading(kept, failed), kept)
assert.deepEqual(nextReading(kept, { ok: true, stops: ["YT119"] }).stops, ["YT119"])
assert.equal(nextReading(failed, failed), failed)
const published = { ok: true, listReady: true, stops: ["HU904"] }
const catchingUp = { ok: true, listReady: false, stops: ["YL991"] }
assert.equal(nextReading(published, catchingUp), published)
assert.deepEqual(nextReading(catchingUp, published).stops, ["HU904"])
assert.equal(nextReading(null, catchingUp), catchingUp)
assert.equal(readingForView(published, catchingUp, true), published)
assert.deepEqual(readingForView(published, catchingUp, false).stops, ["YL991"])

assert.equal(scheduleLiveRead(true, "/api/parking/places?wide=1"), "wait")
assert.equal(scheduleLiveRead(false, "/api/parking/places?wide=1"), "fetch")
assert.equal(scheduleLiveRead(false, null), "stop")
assert.equal(continueLiveRead("/api/parking/places?a=1", "/api/parking/places?b=1"), true)
assert.equal(continueLiveRead("/api/parking/places?a=1", "/api/parking/places?a=1"), false)
assert.equal(continueLiveRead("/api/parking/places?a=1", null), true)

console.log("last reading ok")
