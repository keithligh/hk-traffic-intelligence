import assert from "node:assert/strict"
import { cycleStatus, kmbListFollowMs, withinBudget } from "./list-wait.ts"

const ready = await withinBudget(Promise.resolve("done"), 1_000)
assert.equal(ready, true)

let release: (value: string) => void = () => {}
const late = new Promise<string>((resolve) => {
  release = resolve
})
const early = withinBudget(late, 30)
const answered = await early
assert.equal(answered, false)
release("done")
await late

assert.equal(kmbListFollowMs({ ok: true, listReady: false }), 2_000)
assert.equal(kmbListFollowMs({ ok: true, listReady: true }), null)
assert.equal(kmbListFollowMs({ ok: true, listReady: true, refreshing: true }), 2_000)
assert.equal(kmbListFollowMs({ ok: true }), null)
assert.equal(kmbListFollowMs({ ok: false, listReady: false }), null)
assert.equal(kmbListFollowMs({ ok: false, refreshing: true }), null)

const now = 1_000
assert.deepEqual(cycleStatus(now, now + 1, false, false), { listReady: true, refreshing: false })
assert.deepEqual(cycleStatus(now, 0, false, false), { listReady: false, refreshing: false })
assert.deepEqual(cycleStatus(now, 0, true, false), { listReady: true, refreshing: true })
assert.deepEqual(cycleStatus(now, 0, true, true), { listReady: true, refreshing: false })

console.log("list-wait")
