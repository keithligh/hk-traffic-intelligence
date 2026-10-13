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

let openGate: () => void = () => {}
const gate = new Promise<void>((resolve) => {
  openGate = resolve
})
const original = globalThis.fetch
globalThis.fetch = async () => {
  await gate
  return new Response(JSON.stringify({ data: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

const { loadKmbPlaces } = await import("./kmb-feed.ts")

const pending = loadKmbPlaces(114.06741, 22.52333, Date.now(), 18, false, 40)
const places = await pending
assert.equal(places.ok, true)
assert.equal(places.listReady, false)
assert.ok(places.stops.some((stop) => stop.nameTc.includes("皇崗口岸")))
assert.ok(places.stops.some((stop) => stop.routes.includes("B11")))

openGate()
const again = await loadKmbPlaces(114.06741, 22.52333, Date.now(), 18)
assert.equal(again.listReady, true)
assert.ok(again.stops.some((stop) => stop.nameTc.includes("皇崗口岸")))

globalThis.fetch = original
console.log("kmb-list-ready")
