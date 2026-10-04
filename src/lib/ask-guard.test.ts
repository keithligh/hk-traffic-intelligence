import assert from "node:assert/strict"
import { jevGuard, questionKey, RateLimit } from "./ask-guard.ts"

// Rate limit: five questions per visitor per ten minutes, the window sliding.
const limit = new RateLimit(5, 10 * 60_000)
const t0 = Date.UTC(2026, 9, 4, 2, 0)
for (let i = 0; i < 5; i++) assert.equal(limit.allow("1.2.3.4", t0 + i * 1000), true)
assert.equal(limit.allow("1.2.3.4", t0 + 6000), false)
assert.equal(limit.allow("5.6.7.8", t0 + 6000), true, "another visitor is not affected")
assert.equal(limit.allow("1.2.3.4", t0 + 10 * 60_000 + 1000), true, "the oldest question has left the window")

// Cache key: the same question in other spacing or case is one key per window and language.
assert.equal(questionKey(" Which  tunnel? ", "en", t0), questionKey("which tunnel?", "en", t0 + 60_000))
assert.notEqual(questionKey("which tunnel?", "en", t0), questionKey("which tunnel?", "zh-HK", t0))
assert.notEqual(questionKey("which tunnel?", "en", t0), questionKey("which tunnel?", "en", t0 + 5 * 60_000))

// Jev: the request TypeSafe expects, and the noul read back.
let sent: { url: string; body: Record<string, unknown>; auth: string } | null = null
const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
  sent = { url: String(url), body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("Authorization") ?? "" }
  return Response.json({ model: "jev-1.13.0", answers: { unsupported: { type: "noul", noul: 0.77 } } })
}
const guard = jevGuard("key-1", fakeFetch)
assert.equal(await guard("facts here", "answer here"), 0.77)
assert.ok(sent)
const request = sent as { url: string; body: Record<string, unknown>; auth: string }
assert.equal(request.url, "https://api.typesafe.ai/v1/systemone")
assert.equal(request.auth, "Bearer key-1")
assert.equal(request.body.model, "jev-latest")
assert.deepEqual(request.body.state, { facts: "facts here", answer: "answer here" })
assert.equal((request.body.questions as Record<string, { type: string }>).unsupported.type, "noul")

// The same check through OpenRouter, for a deployment that holds an OpenRouter key.
const viaRouter = jevGuard("or-key", fakeFetch, "openrouter")
assert.equal(await viaRouter("f", "a"), 0.77)
const routed = sent as unknown as { url: string; body: Record<string, unknown>; auth: string }
assert.equal(routed.url, "https://openrouter.ai/api/alpha/decisions")
assert.equal(routed.auth, "Bearer or-key")
assert.equal(routed.body.model, "~typesafe/jev-latest")

// Any Jev failure means "could not say", never a crash.
assert.equal(await jevGuard("k", async () => new Response("down", { status: 529 }))("f", "a"), null)
assert.equal(await jevGuard("k", async () => Promise.reject(new Error("offline")))("f", "a"), null)
assert.equal(await jevGuard("k", async () => Response.json({ answers: {} }))("f", "a"), null)

console.log("ask guard ok")
