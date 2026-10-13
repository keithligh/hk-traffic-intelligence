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

const pending = loadKmbPlaces(114.06741, 22.52333, Date.now(), 18)
let settled = false
void Promise.resolve(pending).then(() => {
  settled = true
})
await Promise.resolve()
await Promise.resolve()
assert.equal(settled, false)

openGate()
const places = await pending
assert.equal(places.ok, true)
assert.ok(places.stops.some((stop) => stop.nameTc.includes("皇崗口岸")))
assert.ok(places.stops.some((stop) => stop.routes.includes("B11")))

globalThis.fetch = original
console.log("kmb-list-ready")
