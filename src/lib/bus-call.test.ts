import assert from "node:assert/strict"
import { ferryArrivalLine, kmbArrivalLine } from "./bus-call.ts"
import { MESSAGES } from "./i18n.ts"

const weekday = "只限星期一至五（公眾假期除外）"
const hk = MESSAGES["zh-HK"]
const restricted = kmbArrivalLine(null, "", weekday, false, hk)
assert.equal(restricted.when, "沒有到站時間")
assert.equal(restricted.note, weekday)

const timed = kmbArrivalLine(6, "2026-11-15T03:06:00+08:00", weekday, true, hk)
assert.equal(timed.when, "6 分鐘")
assert.equal(timed.note, `原定班次 ${weekday}`)

const english = kmbArrivalLine(null, "", "The final bus has departed from this stop", false, MESSAGES.en)
assert.equal(english.when, "No arrival on the board")
assert.equal(english.note, "The final bus has departed from this stop")

const ferryNote = "6至8分鐘一班"
const ferryOpen = ferryArrivalLine(null, "", ferryNote, "天星", "天星", false, hk)
assert.equal(ferryOpen.when, "沒有到站時間")
assert.equal(ferryOpen.note, `天星 ${ferryNote}`)

const ferryTimed = ferryArrivalLine(4, "2026-11-15T03:10:00+08:00", "風浪", "新渡輪", "新渡輪", false, hk)
assert.equal(ferryTimed.when, "4 分鐘")
assert.equal(ferryTimed.note, "風浪")

const ferryScheduled = ferryArrivalLine(null, "", "", "新渡輪", "新渡輪", true, hk)
assert.equal(ferryScheduled.when, "沒有到站時間")
assert.equal(ferryScheduled.note, "新渡輪")

console.log("bus call ok")
