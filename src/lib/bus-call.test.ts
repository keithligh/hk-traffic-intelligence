import assert from "node:assert/strict"
import { kmbArrivalLine } from "./bus-call.ts"
import { MESSAGES } from "./i18n.ts"

const weekday = "只限星期一至五（公眾假期除外）"
const restricted = kmbArrivalLine(null, "", weekday, false, MESSAGES["zh-HK"])
assert.equal(restricted.when, "沒有到站時間")
assert.equal(restricted.note, weekday)

const timed = kmbArrivalLine(6, "2026-11-15T03:06:00+08:00", weekday, true, MESSAGES["zh-HK"])
assert.equal(timed.when, "6 分鐘")
assert.equal(timed.note, `原定班次 ${weekday}`)

console.log("bus call ok")
