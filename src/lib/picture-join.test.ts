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

const { mergePicture } = await import("./picture-join.ts")

const empty = { type: "FeatureCollection" as const, features: [] }
const cameras = {
  ok: true,
  cameras: { type: "FeatureCollection" as const, features: [{ type: "Feature" as const, properties: { id: "cam" }, geometry: { type: "Point" as const, coordinates: [114.1, 22.2] } }] },
  works: empty,
  tolls: { type: "FeatureCollection" as const, features: [{ type: "Feature" as const, properties: { id: "toll" }, geometry: { type: "Point" as const, coordinates: [114.2, 22.3] } }] },
}
const works = {
  ok: true,
  cameras: empty,
  works: { type: "FeatureCollection" as const, features: [{ type: "Feature" as const, properties: { id: "work" }, geometry: { type: "Point" as const, coordinates: [114.3, 22.4] } }] },
  tolls: empty,
}
const merged = mergePicture(cameras, works)
assert.equal(merged?.ok, true)
assert.equal(merged?.cameras.features[0]?.properties?.id, "cam")
assert.equal(merged?.works.features[0]?.properties?.id, "work")
assert.equal(merged?.tolls.features[0]?.properties?.id, "toll")
assert.equal(mergePicture(null, null), null)
const failed = mergePicture({ ...cameras, ok: false, error: "cams" }, { ...works, error: "works" })
assert.equal(failed?.ok, true)
assert.match(failed?.error ?? "", /cams/)
assert.match(failed?.error ?? "", /works/)

console.log("picture join ok")
