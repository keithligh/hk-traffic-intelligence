import assert from "node:assert/strict"
import { skyFor, sunAltitude } from "./sun-sky.ts"

const HK = { lat: 22.3, lng: 114.17 }
const near = (actual: number, expected: number, tolerance: number, label: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual.toFixed(2)} vs ${expected}`)

// References: noon altitude = 90 - |lat - declination| (declination from the NOAA
// solar tables: ~-0.2 deg on the 2026-03-20 equinox, +23.44 at the June solstice,
// -23.44 at the December one). Hong Kong's solar noon falls ~12:20-12:30 HKT
// (04:20-04:30 UTC): 23 min for 114.17E vs the 120E zone meridian, plus the
// equation of time. Midnight is the mirror: -(90 - lat - declination) roughly.
near(sunAltitude(new Date("2026-03-20T04:31:00Z"), HK.lat, HK.lng), 67.5, 1, "equinox noon")
near(sunAltitude(new Date("2026-06-21T04:25:00Z"), HK.lat, HK.lng), 88.9, 1, "June solstice noon")
near(sunAltitude(new Date("2026-12-21T04:21:00Z"), HK.lat, HK.lng), 44.3, 1, "December solstice noon")
near(sunAltitude(new Date("2026-03-20T16:31:00Z"), HK.lat, HK.lng), -67.9, 1, "equinox midnight")
// Around the equinox the sun crosses the horizon ~6 h either side of noon.
near(sunAltitude(new Date("2026-03-20T22:31:00Z"), HK.lat, HK.lng), 0, 1.5, "equinox sunrise")

// Night is the gradient the map always had, so nothing changes after dark.
const night = {
  "sky-color": "#03111c",
  "horizon-color": "#1f6f8b",
  "fog-color": "#0a2433",
  "sky-horizon-blend": 0.7,
  "horizon-fog-blend": 0.6,
  "fog-ground-blend": 0.4,
  "atmosphere-blend": 0,
}
assert.deepEqual(skyFor(-6), night)
assert.deepEqual(skyFor(-40), night)

const rgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))

// Day is a blue sky: blue leads red, and it is far brighter than night.
const day = skyFor(45)
assert.deepEqual(skyFor(6), day)
const [dayR, , dayB] = rgb(day["sky-color"])
assert.ok(dayB > dayR && dayB > 150, `day sky ${day["sky-color"]}`)

// Twilight warms the horizon: red leads blue at sunrise.
const [dawnR, , dawnB] = rgb(skyFor(0)["horizon-color"])
assert.ok(dawnR > dawnB, `dawn horizon ${skyFor(0)["horizon-color"]}`)

// No jumps: a tenth of a degree never moves a channel or blend far.
const keys = ["sky-color", "horizon-color", "fog-color"] as const
const blends = ["sky-horizon-blend", "horizon-fog-blend", "fog-ground-blend", "atmosphere-blend"] as const
for (let altitude = -10; altitude < 10; altitude += 0.1) {
  const a = skyFor(altitude)
  const b = skyFor(altitude + 0.1)
  for (const key of keys) {
    const step = Math.max(...rgb(a[key]).map((value, index) => Math.abs(value - rgb(b[key])[index])))
    assert.ok(step <= 6, `${key} jumps ${step} at ${altitude.toFixed(1)}`)
  }
  for (const key of blends) assert.ok(Math.abs(a[key] - b[key]) <= 0.02, `${key} jumps at ${altitude.toFixed(1)}`)
}

console.log("sun-sky ok")
