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
const plain = await jsonResponse(new Request("http://local/api/traffic"), body, 200)
assert.equal(plain.headers.get("content-encoding"), null)
assert.equal(plain.status, 200)
assert.deepEqual(await plain.json(), body)

const gzipped = await jsonResponse(
  new Request("http://local/api/traffic", { headers: { "accept-encoding": "gzip, deflate, br" } }),
  body,
  200,
)
assert.equal(gzipped.status, 200)
assert.equal(gzipped.headers.get("content-type"), "application/json; charset=utf-8")
assert.equal(gzipped.headers.get("content-encoding"), "gzip")
assert.match(gzipped.headers.get("cache-control") ?? "", /no-store/)
const decoded = await new Response(gzipped.body?.pipeThrough(new DecompressionStream("gzip"))).json()
assert.deepEqual(decoded, body)

const local = await jsonResponse(
  new Request("http://[::1]:4318/api/traffic", { headers: { "accept-encoding": "gzip", host: "[::1]:4318" } }),
  body,
  200,
)
assert.equal(local.headers.get("content-encoding"), null)
assert.deepEqual(await local.json(), body)

const small = await jsonResponse(
  new Request("http://local/api/traffic", { headers: { "accept-encoding": "gzip" } }),
  { ok: false },
  502,
)
assert.equal(small.status, 502)
assert.equal(small.headers.get("content-encoding"), null)

console.log("json response ok")
