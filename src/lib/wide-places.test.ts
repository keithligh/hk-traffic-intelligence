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

const { loadCitybusPlaces } = await import("./citybus-feed.ts")
const { GET: citybusPlaces } = await import("../app/api/citybus/places/route.ts")
const { loadGmbPlaces } = await import("./gmb-feed.ts")
const { GET: gmbPlaces } = await import("../app/api/gmb/places/route.ts")
const { kmbPlacesAt } = await import("./kmb-feed.ts")
const { loadNlbPlaces } = await import("./nlb-feed.ts")
const { GET: nlbPlaces } = await import("../app/api/nlb/places/route.ts")

const centre = { lng: 114.175, lat: 22.293 }
const zoom = 10

function farthest(stops: { lng: number; lat: number }[]): number {
  const cos = Math.cos((centre.lat * Math.PI) / 180)
  return Math.max(
    ...stops.map((stop) => {
      const east = (stop.lng - centre.lng) * cos * 111_320
      const north = (stop.lat - centre.lat) * 110_540
      return Math.hypot(east, north)
    }),
  )
}

const citybus = loadCitybusPlaces(centre.lng, centre.lat)
const citybusWide = loadCitybusPlaces(centre.lng, centre.lat, true, zoom)
assert.ok(citybus.stops.length > 0)
assert.ok(citybus.stops.length <= 40)
assert.ok(citybusWide.stops.length > citybus.stops.length)
assert.ok(citybusWide.stops.length <= 200)
assert.ok(farthest(citybusWide.stops) > farthest(citybus.stops))

const nlb = loadNlbPlaces(centre.lng, centre.lat)
const nlbWide = loadNlbPlaces(centre.lng, centre.lat, true, zoom)
assert.ok(nlb.stops.length <= 6)
assert.ok(nlbWide.stops.length > nlb.stops.length)
assert.ok(nlbWide.stops.length <= 120)
const muiWoStreet = loadNlbPlaces(114.002, 22.265, false, 16)
const muiWoClose = loadNlbPlaces(114.002, 22.265, false, 19)
assert.ok(muiWoStreet.stops.length > 6)
assert.ok(muiWoStreet.stops.length <= 40)
assert.ok(muiWoClose.stops.length > 0)
assert.ok(muiWoClose.stops.length < muiWoStreet.stops.length)

const gmb = loadGmbPlaces(centre.lng, centre.lat, 0, 16)
const gmbFar = loadGmbPlaces(centre.lng, centre.lat, 0, zoom)
const gmbWide = loadGmbPlaces(centre.lng, centre.lat, 0, zoom, true)
assert.ok(gmb.stops.length > 0)
assert.ok(gmb.stops.length <= 24)
assert.ok(gmbFar.stops.length <= 24)
assert.ok(gmbWide.stops.length > gmbFar.stops.length)
assert.ok(gmbWide.stops.length <= 160)

const kmb = kmbPlacesAt(centre.lng, centre.lat, 16)
const kmbFar = kmbPlacesAt(centre.lng, centre.lat, zoom)
const kmbWide = kmbPlacesAt(centre.lng, centre.lat, zoom, true)
assert.ok(kmb.stops.length > 0)
assert.ok(kmb.stops.length <= 40)
assert.ok(kmbFar.stops.length <= 40)
assert.ok(kmbWide.stops.length > kmbFar.stops.length)
assert.ok(kmbWide.stops.length <= 160)
assert.ok(farthest(kmbWide.stops) > farthest(kmbFar.stops))
const kmbBytes = JSON.stringify(kmbWide).length
assert.ok(kmbBytes < 80_000)

const query = `lng=${centre.lng}&lat=${centre.lat}&zoom=${zoom}`
const citybusRoute = await citybusPlaces(new Request(`http://local/api/citybus/places?${query}&wide=1`))
const citybusBody = await citybusRoute.json() as { stops: unknown[] }
assert.equal(citybusRoute.status, 200)
assert.equal(citybusBody.stops.length, citybusWide.stops.length)
const citybusNear = await citybusPlaces(new Request(`http://local/api/citybus/places?lng=${centre.lng}&lat=${centre.lat}`))
const citybusNearBody = await citybusNear.json() as { stops: unknown[] }
assert.equal(citybusNear.status, 200)
assert.ok(citybusNearBody.stops.length <= 40)
assert.ok(citybusNearBody.stops.length > 6)
const chingTin = loadCitybusPlaces(113.972, 22.413, false, 16)
const huanggang = loadCitybusPlaces(114.067, 22.523, false, 16)
assert.ok(chingTin.stops.some((stop) => stop.id === "004004"))
assert.ok(huanggang.stops.some((stop) => stop.id === "003939"))

const gmbRoute = await gmbPlaces(new Request(`http://local/api/gmb/places?${query}&wide=1`))
const gmbBody = await gmbRoute.json() as { stops: unknown[] }
assert.equal(gmbRoute.status, 200)
assert.equal(gmbBody.stops.length, gmbWide.stops.length)

const nlbRoute = await nlbPlaces(new Request(`http://local/api/nlb/places?${query}&wide=1`))
const nlbBody = await nlbRoute.json() as { stops: unknown[] }
assert.equal(nlbRoute.status, 200)
assert.equal(nlbBody.stops.length, nlbWide.stops.length)

console.log("wide places ok", {
  citybus: citybusWide.stops.length,
  nlb: nlbWide.stops.length,
  gmb: gmbWide.stops.length,
  kmb: kmbWide.stops.length,
  kmbKilobytes: Math.round(kmbBytes / 1024),
})
