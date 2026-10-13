import assert from "node:assert/strict"
import { arrivalWhen } from "./arrival-when.ts"

const now = Date.parse("2026-10-13T14:40:00Z")

assert.equal(arrivalWhen(4, "2026-10-13T14:44:00Z", now), "count")
assert.equal(arrivalWhen(0, "2026-10-13T14:40:12Z", now), "arriving")
assert.equal(arrivalWhen(0, "2026-10-13T14:40:00Z", now), "arriving")
assert.equal(arrivalWhen(0, "2026-10-13T14:34:00Z", now), "gone")
assert.equal(arrivalWhen(0, "", now), "arriving")

console.log("arrival-when")
