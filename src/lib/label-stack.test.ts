import assert from "node:assert/strict"
import { labelsAboveMap } from "./label-stack.ts"

const moving = labelsAboveMap.slice(-6)
assert.deepEqual(moving, [
  "ferry-vessels",
  "ferry-vessel-label",
  "lrt-trains",
  "lrt-train-label",
  "mtr-trains",
  "mtr-train-label",
])
assert.ok(labelsAboveMap.indexOf("motorcycle-label") < labelsAboveMap.indexOf("parking-label"))
assert.ok(labelsAboveMap.indexOf("citybus-stop-label") < labelsAboveMap.indexOf("kmb-stop-label"))
assert.ok(labelsAboveMap.indexOf("kmb-stop-label") < labelsAboveMap.indexOf("ferry-vessel-label"))
assert.ok(labelsAboveMap.indexOf("kmb-stops") < labelsAboveMap.indexOf("kmb-stop-label"))
assert.ok(labelsAboveMap.indexOf("citybus-stop-label") < labelsAboveMap.indexOf("mtr-train-label"))
assert.ok(labelsAboveMap.includes("ferry-pier-label"))
assert.equal(labelsAboveMap.includes("incidents"), false)

console.log("label stack ok")
