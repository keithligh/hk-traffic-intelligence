import assert from "node:assert/strict"
import { spokenPlace } from "./spoken-place.ts"

assert.deepEqual(spokenPlace("碩門邨", "SHEK MUN ESTATE"), { tc: "石門", en: "Shek Mun" })
assert.deepEqual(spokenPlace("機場(地面運輸中心)", "AIRPORT (GROUND TRANSPORTATION CENTRE)"), {
  tc: "機場(地面運輸中心)",
  en: "AIRPORT (GROUND TRANSPORTATION CENTRE)",
})

console.log("spoken place ok")
