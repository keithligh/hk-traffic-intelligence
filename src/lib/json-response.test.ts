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

const { jsonResponse } = await import("./json-response.ts")

const body = { ok: true, corridors: Array.from({ length: 50 }, (_, index) => ({ id: `s${index}`, speedKmh: 40 })) }
const plain = jsonResponse(new Request("http://local/api/traffic", { headers: { "accept-encoding": "gzip" } }), body, 200)
assert.equal(plain.headers.get("content-encoding"), null)
assert.equal(plain.status, 200)
assert.equal(plain.headers.get("content-type"), "application/json; charset=utf-8")
assert.match(plain.headers.get("cache-control") ?? "", /no-store/)
assert.deepEqual(await plain.json(), body)

const small = jsonResponse(new Request("http://local/api/traffic"), { ok: false }, 502)
assert.equal(small.status, 502)
assert.equal(small.headers.get("content-encoding"), null)

console.log("json response ok")
