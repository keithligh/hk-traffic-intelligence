import assert from "node:assert/strict"
import { shownChargerFree } from "./charger-free.ts"

assert.equal(shownChargerFree(3), 3)
assert.equal(shownChargerFree(0), 0)
assert.equal(shownChargerFree("4"), 4)
assert.equal(shownChargerFree(-1), null)
assert.equal(shownChargerFree(null), null)

console.log("charger free ok")
