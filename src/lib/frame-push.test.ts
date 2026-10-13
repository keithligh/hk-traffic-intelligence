import assert from "node:assert/strict"
import { PUSH_GAP_MS, beginPush, endPush, pushDue, type PushGate } from "./frame-push.ts"

const gate: PushGate = { busy: false, at: 0 }
assert.equal(beginPush(gate, 1000, 140), true)
assert.equal(gate.busy, true)
assert.equal(beginPush(gate, 1100, 140), false)
assert.equal(gate.at, 1000)

endPush(gate)
assert.equal(beginPush(gate, 1100, 140), false)
assert.equal(beginPush(gate, 1140, 140), true)
assert.equal(beginPush(gate, 5000, 140), false)
assert.equal(gate.at, 1140)
endPush(gate)
assert.equal(beginPush(gate, 5000, 140), true)

const desktop: PushGate = { busy: false, at: 0 }
assert.equal(beginPush(desktop, 50, 0), true)
endPush(desktop)
assert.equal(beginPush(desktop, 50, 0), true)

const paced: PushGate = { busy: false, at: 0 }
assert.equal(PUSH_GAP_MS, 140)
assert.equal(pushDue(paced, 140, PUSH_GAP_MS), true)
assert.equal(paced.busy, false)
assert.equal(paced.at, 0)
assert.equal(beginPush(paced, 140, PUSH_GAP_MS), true)
assert.equal(pushDue(paced, 200, PUSH_GAP_MS), false)
endPush(paced)
assert.equal(pushDue(paced, 200, PUSH_GAP_MS), false)
assert.equal(pushDue(paced, 280, PUSH_GAP_MS), true)
