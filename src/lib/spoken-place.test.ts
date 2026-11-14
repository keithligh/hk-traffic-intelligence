import assert from "node:assert/strict"
import { directionIsNews, spokenPlace } from "./spoken-place.ts"

assert.deepEqual(spokenPlace("碩門邨", "SHEK MUN ESTATE"), { tc: "石門", en: "Shek Mun" })
assert.deepEqual(spokenPlace("機場(地面運輸中心)", "AIRPORT (GROUND TRANSPORTATION CENTRE)"), {
  tc: "機場(地面運輸中心)",
  en: "AIRPORT (GROUND TRANSPORTATION CENTRE)",
})

assert.equal(directionIsNews("機場地面運輸中心 (落客站)", "AIRPORT (GTC) (ALIGHTING STOP)", "機場(地面運輸中心)", "AIRPORT (GROUND TRANSPORTATION CENTRE)"), false)
assert.equal(directionIsNews("機場地面運輸中心", "AIRPORT (GTC)", "碩門邨", "SHEK MUN ESTATE"), true)
assert.equal(directionIsNews("石門總站", "SHEK MUN BUS TERMINUS", "碩門邨", "SHEK MUN ESTATE"), false)
assert.equal(directionIsNews("石門總站", "SHEK MUN BUS TERMINUS", "機場(地面運輸中心)", "AIRPORT (GROUND TRANSPORTATION CENTRE)"), true)

console.log("spoken place ok")
