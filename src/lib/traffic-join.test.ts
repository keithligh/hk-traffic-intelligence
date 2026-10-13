import assert from "node:assert/strict"
import { register } from "node:module"

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

const { applySpeeds, isSpeedReading, nextRoads, speedReading } = await import("./traffic-join.ts")

const full = {
  ok: true,
  observedAt: "2026-10-13 08:00",
  summary: { corridorCount: 2, detectorCount: 1, meanSpeedKmh: 40, free: 1, slow: 1, congested: 0, unknown: 0 },
  segments: { ok: true, observedAt: "2026-10-13 08:00", validCount: 2, invalidCount: 0, meanSpeedKmh: 40 },
  network: { ok: true, revisionDate: "2026-10-01", usedOnMap: true, reason: "centreline" },
  corridors: [
    { id: "a", roadTc: "干諾道", roadEn: "Connaught Road", direction: "E", speedKmh: 40, band: "slow" as const, lengthKm: 1, detectorCount: 1, coordinates: [[114.15, 22.28], [114.16, 22.29]] as [number, number][] },
    { id: "b", roadTc: "告士打道", roadEn: "Gloucester Road", direction: "W", speedKmh: 70, band: "free" as const, lengthKm: 1, detectorCount: 1, coordinates: [[114.17, 22.28]] as [number, number][] },
  ],
}

const patch = speedReading({
  ...full,
  observedAt: "2026-10-13 08:01",
  corridors: [
    { ...full.corridors[0], speedKmh: 20, band: "congested" },
    { ...full.corridors[1], speedKmh: 65, band: "free" },
  ],
})
assert.equal(patch.shape, "speeds")
assert.equal(patch.speeds[0]?.speedKmh, 20)
assert.equal("coordinates" in patch.speeds[0], false)
assert.equal(isSpeedReading(patch), true)
assert.equal(isSpeedReading(full), false)

const joined = applySpeeds(full, patch)
assert.ok(joined)
assert.equal(joined?.corridors[0]?.speedKmh, 20)
assert.equal(joined?.corridors[0]?.band, "congested")
assert.deepEqual(joined?.corridors[0]?.coordinates, full.corridors[0]?.coordinates)
assert.equal(joined?.corridors[0]?.roadEn, "Connaught Road")
assert.equal(joined?.observedAt, "2026-10-13 08:01")

assert.equal(applySpeeds(full, { ...patch, speeds: [...patch.speeds, { id: "new", speedKmh: 10, band: "congested" }] }), null)
assert.equal(applySpeeds(full, { ...patch, network: { ...patch.network, revisionDate: "2026-10-02" } }), null)

const dropped = applySpeeds(full, { ...patch, speeds: [patch.speeds[0]!] })
assert.equal(dropped?.corridors.length, 1)
assert.equal(dropped?.corridors[0]?.id, "a")

const held = nextRoads(null, full)
assert.equal(held.shape, "speeds")
assert.equal(held.roads?.corridors.length, 2)
const updated = nextRoads(held.roads, patch)
assert.equal(updated.shape, "speeds")
assert.equal(updated.roads?.corridors[0]?.speedKmh, 20)
const reset = nextRoads(held.roads, { ...patch, speeds: [{ id: "missing", speedKmh: 1, band: "free" }] })
assert.equal(reset.shape, "full")
assert.equal(reset.roads, held.roads)

console.log("traffic join ok")
