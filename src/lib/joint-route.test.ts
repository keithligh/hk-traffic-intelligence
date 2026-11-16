import assert from "node:assert/strict"
import { jointPartner, jointRouteNumbers, placesMatch } from "./joint-route.ts"

assert.equal(placesMatch("寶達", "寶達邨"), true)
assert.equal(placesMatch("天后站", "天后"), true)
assert.equal(placesMatch("金鐘站(東)", "金鐘 (東)"), true)
assert.equal(placesMatch("竹園邨", "尖沙咀碼頭"), false)

const joint = jointRouteNumbers(
  [
    { route: "111", origTc: "坪石", destTc: "中環(港澳碼頭)" },
    { route: "1", origTc: "竹園邨", destTc: "尖沙咀碼頭" },
    { route: "601", origTc: "寶達", destTc: "金鐘站(東)" },
  ],
  [
    { route: "111", origTc: "中環(港澳碼頭)", destTc: "坪石" },
    { route: "1", origTc: "跑馬地", destTc: "中環碼頭" },
    { route: "601", origTc: "金鐘 (東)", destTc: "寶達邨" },
  ],
)
assert.deepEqual(joint, ["111", "601"])

const partner = jointPartner(
  ["111", "1"],
  { lng: 114.15, lat: 22.28 },
  [
    { id: "far", lng: 114.2, lat: 22.3, routes: ["111"] },
    { id: "near", lng: 114.1502, lat: 22.2802, routes: ["111", "5B"] },
  ],
  new Set(["111", "601"]),
  80,
)
assert.deepEqual(partner, { id: "near", routes: ["111"] })

console.log("joint route ok")
