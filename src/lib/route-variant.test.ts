import assert from "node:assert/strict"
import { MESSAGES } from "./i18n.ts"
import { readServiceVariants, stopSetDifference, variantNote } from "./route-variant.ts"

const book = new Map([
  ["73X\nO\n1", { destTc: "大埔(富善)", destEn: "TAI PO (FU SHIN)" }],
  ["73X\nO\n2", { destTc: "大埔(富善)", destEn: "TAI PO (FU SHIN)" }],
])

const parsed = readServiceVariants({
  data: [
    { route: "73X", bound: "O", service_type: 1, seq: 2, stop: "B" },
    { route: "73X", bound: "O", service_type: 1, seq: 1, stop: "A" },
    { route: "73X", bound: "O", service_type: 2, seq: 1, stop: "A" },
    { route: "73X", bound: "O", service_type: 2, seq: 2, stop: "C" },
    { route: "1", bound: "O", service_type: 1, seq: 1, stop: "Z" },
  ],
}, book)
assert.ok(parsed)
const usual = parsed.variants.find((item) => item.service === "1" && item.route === "73X")
const special = parsed.variants.find((item) => item.service === "2" && item.route === "73X")
assert.deepEqual(usual?.stops, ["A", "B"])
assert.deepEqual(special?.stops, ["A", "C"])
assert.deepEqual(parsed.atStop.A, ["73X\nO\n1", "73X\nO\n2"])
assert.deepEqual(parsed.atStop.B, ["73X\nO\n1"])

const gap = stopSetDifference(["A", "B"], ["A", "C"])
assert.deepEqual(gap, { skip: ["B"], add: ["C"] })

const hk = MESSAGES["zh-HK"]
assert.equal(variantNote(hk, true, ["佐敦", "旺角", "油麻地"], ["紅磡"]), "特別班，不經佐敦、旺角等1個站，加經紅磡")
assert.equal(variantNote(hk, false, [], []), "")
assert.equal(variantNote(MESSAGES.en, true, ["Jordan"], []), "Special departure, skips Jordan")

console.log("route variant ok")
