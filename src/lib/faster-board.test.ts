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

const KNOWN = "18492910339410B1"
const JOINT = "9583BCF159B682BA"

let releaseBook: () => void = () => {}
const bookGate = new Promise<void>((resolve) => {
  releaseBook = resolve
})
let releaseCitybus: () => void = () => {}
const citybusGate = new Promise<void>((resolve) => {
  releaseCitybus = resolve
})

const original = globalThis.fetch
globalThis.fetch = async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (url.includes("stop-eta")) {
    const route = url.includes(JOINT) ? "103" : "1"
    return json({
      data: [{
        co: "KMB",
        route,
        dir: "O",
        service_type: 1,
        dest_tc: "測試",
        dest_en: "Test",
        eta: new Date(Date.now() + 5 * 60_000).toISOString(),
        eta_seq: 1,
        rmk_tc: "",
        rmk_en: "",
      }],
    })
  }
  if (url.includes("citybus")) {
    await citybusGate
    return json({ data: [] })
  }
  await bookGate
  return json({ data: [] })
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

const { loadKmbBoard } = await import("./kmb-feed.ts")
const { loadStopBoard } = await import("./stop-board.ts")

try {
  const knownStart = Date.now()
  const known = await loadKmbBoard(KNOWN)
  const knownMs = Date.now() - knownStart
  assert.equal(known.ok, true)
  if (known.ok) assert.equal(known.stop.calls[0]?.route, "1")
  assert.ok(knownMs < 1_500, `known stop waited ${knownMs}ms for the route book`)
  console.log(`known stop ${knownMs}ms`)

  const jointStart = Date.now()
  const joint = await loadStopBoard("kmb", JOINT)
  const jointMs = Date.now() - jointStart
  assert.equal(joint.ok, true)
  if (joint.ok) {
    assert.equal(joint.stop.calls.some((call) => call.route === "103"), true)
    assert.equal(joint.stop.calls.some((call) => call.paired === true), false)
  }
  assert.ok(jointMs >= 800, `joint wait returned in ${jointMs}ms`)
  assert.ok(jointMs < 2_500, `joint wait took ${jointMs}ms`)
  console.log(`joint card ${jointMs}ms`)

  releaseCitybus()
  const cachedStart = Date.now()
  const cached = await loadStopBoard("kmb", JOINT)
  const cachedMs = Date.now() - cachedStart
  assert.equal(cached.ok, true)
  if (cached.ok) assert.equal(cached.stop.calls.some((call) => call.paired === true), false)
  assert.ok(cachedMs < 300, `cached joint card took ${cachedMs}ms`)
  console.log(`cached joint card ${cachedMs}ms`)
} finally {
  releaseBook()
  releaseCitybus()
  globalThis.fetch = original
}

console.log("faster-board")
