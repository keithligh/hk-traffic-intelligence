import assert from "node:assert/strict"
import { answerQuestion, readAnswer, type AskWriters } from "./ask-llm.ts"

const facts = [
  "Time: 2026-10-04 09:30 Hong Kong time",
  "Harbour crossing times from 告士打道東行近稅務大樓 (Gloucester Road eastbound near Revenue Tower): Cross-Harbour Tunnel (紅隧) 7 min, Eastern Harbour Crossing (東隧) 9 min",
  "Open traffic incidents: 交通意外 Traffic accident at 青雲路 Tsing Wan Road",
].join("\n")

const answer = (body: object) => JSON.stringify(body)
const good = answer({
  answerable: true,
  answer: "由告士打道出發，紅隧最快，7 分鐘。",
  basis: ["Harbour crossing times from 告士打道東行近稅務大樓 (Gloucester Road eastbound near Revenue Tower): Cross-Harbour Tunnel (紅隧) 7 min"],
})

// Shape and grounding: every basis must be words the facts actually contain.
assert.deepEqual(readAnswer(good, facts), JSON.parse(good))
assert.equal(readAnswer("", facts), "empty answer")
assert.equal(readAnswer("nope", facts), "not JSON")
assert.equal(readAnswer(answer({ answerable: true, answer: "", basis: ["Time"] }), facts), "answer empty")
assert.equal(readAnswer(answer({ answerable: true, answer: "x".repeat(601), basis: ["Time"] }), facts), "answer too long (601)")
assert.equal(readAnswer(answer({ answerable: true, answer: "紅隧最快", basis: [] }), facts), "no basis for an answer")
assert.equal(
  readAnswer(answer({ answerable: true, answer: "紅隧最快", basis: ["Cross-Harbour Tunnel (紅隧) 3 min"] }), facts),
  "basis not in facts: Cross-Harbour Tunnel (紅隧) 3 min",
)
// Spacing differences are not a reason to reject a quote.
assert.ok(typeof readAnswer(answer({ answerable: true, answer: "有意外", basis: ["Open traffic incidents:  交通意外"] }), facts) === "object")
// A quote may skip items of a "; " list, but every item it keeps must be verbatim.
const listFacts = "Congested roads, longest first: 連翔道 Lin Cheung Road 0.8 km, slowest 16 km/h; 天影路 Tin Ying Road 0.6 km, slowest 9 km/h; 皇后大道東 Queen's Road East 0.5 km, slowest 9 km/h"
assert.ok(
  typeof readAnswer(answer({ answerable: true, answer: "連翔道及皇后大道東擠塞。", basis: ["Congested roads, longest first: 連翔道 Lin Cheung Road 0.8 km, slowest 16 km/h; 皇后大道東 Queen's Road East 0.5 km, slowest 9 km/h"] }), listFacts) === "object",
)
assert.equal(
  readAnswer(answer({ answerable: true, answer: "皇后大道東擠塞。", basis: ["Congested roads, longest first: 連翔道 Lin Cheung Road 0.8 km, slowest 16 km/h; 皇后大道東 Queen's Road East 0.5 km, slowest 3 km/h"] }), listFacts),
  "basis not in facts: 皇后大道東 Queen's Road East 0.5 km, slowest 3 km/h",
)

// An ellipsis marks skipped text the same way; what is kept is still checked.
assert.ok(typeof readAnswer(answer({ answerable: true, answer: "皇后大道東擠塞。", basis: ["Congested roads, longest first: ... 皇后大道東 Queen's Road East 0.5 km, slowest 9 km/h"] }), listFacts) === "object")
assert.ok(typeof readAnswer(answer({ answerable: true, answer: "皇后大道東擠塞。", basis: ["Congested roads, longest first: 連翔道 Lin Cheung Road 0.8 km, slowest 16 km/h… 皇后大道東 Queen's Road East 0.5 km"] }), listFacts) === "object")

// Declining needs no basis.
assert.deepEqual(readAnswer(answer({ answerable: false, answer: "我只能回答香港即時交通。", basis: [] }), facts), {
  answerable: false,
  answer: "我只能回答香港即時交通。",
  basis: [],
})

const calls: string[] = []
const writers = (deepseek: string | Error, anthropic: string | Error): AskWriters => ({
  deepseek: async () => {
    calls.push("deepseek")
    if (deepseek instanceof Error) throw deepseek
    return deepseek
  },
  anthropic: async () => {
    calls.push("anthropic")
    if (anthropic instanceof Error) throw anthropic
    return anthropic
  },
})
const keys = { deepseek: "d", anthropic: "a", typesafe: "t" }

// No guard: the first usable answer is served, unchecked.
calls.length = 0
const plain = await answerQuestion("紅隧幾耐？", facts, "zh-HK", keys, writers(good, good), null)
assert.equal(plain.provider, "deepseek")
assert.equal(plain.checked, false)
assert.deepEqual(calls, ["deepseek"])

// Jev passes the answer.
const passed = await answerQuestion("紅隧幾耐？", facts, "zh-HK", keys, writers(good, good), async () => 0.2)
assert.equal(passed.checked, true)
assert.equal(passed.jev, 0.2)
assert.equal(passed.caution, false)

// Jev unsure (0.5 to 0.7): served, flagged, no second call. Accurate answers that
// infer "no accident" from an empty list scored 0.60 and 0.62 in testing.
calls.length = 0
const unsure = await answerQuestion("有冇意外？", facts, "zh-HK", keys, writers(good, good), async () => 0.62)
assert.equal(unsure.provider, "deepseek")
assert.equal(unsure.caution, true)
assert.deepEqual(calls, ["deepseek"])

// Jev rejects DeepSeek's answer, so Claude answers and is checked too.
calls.length = 0
const scores = [0.77, 0.3]
const rescued = await answerQuestion("紅隧幾耐？", facts, "zh-HK", keys, writers(good, good), async () => scores.shift() ?? null)
assert.equal(rescued.provider, "anthropic")
assert.equal(rescued.jev, 0.3)
assert.deepEqual(calls, ["deepseek", "anthropic"])

// Both rejected: an error that says why, so nothing unchecked reaches a visitor.
await assert.rejects(
  answerQuestion("紅隧幾耐？", facts, "zh-HK", keys, writers(good, good), async () => 0.9),
  /deepseek: Jev found an unsupported claim \(0\.9\); anthropic: Jev found an unsupported claim \(0\.9\)/,
)

// A Jev outage does not block answers; they are served as unchecked.
const outage = await answerQuestion("紅隧幾耐？", facts, "zh-HK", keys, writers(good, good), async () => null)
assert.equal(outage.checked, false)

// Declined questions are not sent to Jev.
let asked = 0
const declined = await answerQuestion("今晚食咩好？", facts, "zh-HK", keys, writers(answer({ answerable: false, answer: "我只能回答香港即時交通。", basis: [] }), good), async () => {
  asked += 1
  return 0.9
})
assert.equal(declined.answerable, false)
assert.equal(asked, 0)

// A bad first answer falls back; no keys is an error.
calls.length = 0
assert.equal((await answerQuestion("q", facts, "en", keys, writers(new Error("HTTP 503"), good), null)).provider, "anthropic")
await assert.rejects(answerQuestion("q", facts, "en", {}, writers(good, good), null), /no AI provider key/)

console.log("ask llm ok")
