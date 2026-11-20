import assert from "node:assert/strict"
import { citybusVariantCopy, citybusVariantNote } from "./citybus-variant.ts"

const unnamed = { tc: "未指明特別班", en: "Special not named" }
assert.equal(citybusVariantCopy([], unnamed.tc, unnamed.en), null)
assert.equal(citybusVariantCopy([{ tc: "中環碼頭 - 渣甸山", en: "Central - Jardine's Lookout", special: false }], unnamed.tc, unnamed.en), null)
assert.deepEqual(
  citybusVariantCopy([{ tc: "星期日及公眾假期班次，不經雪廠街", en: "Sundays and public holidays, skips Ice House Street", special: true }], unnamed.tc, unnamed.en),
  { tc: "星期日及公眾假期班次，不經雪廠街", en: "Sundays and public holidays, skips Ice House Street" },
)
const mixed = citybusVariantCopy([
  { tc: "循環線", en: "Circular", special: false },
  { tc: "星期日及公眾假期班次，不經雪廠街", en: "Sundays and public holidays, skips Ice House Street", special: true },
], unnamed.tc, unnamed.en)
assert.equal(mixed?.tc, "未指明特別班，星期日及公眾假期班次，不經雪廠街")
assert.equal(mixed?.en, "Special not named, Sundays and public holidays, skips Ice House Street")

const loaded = await citybusVariantNote("002442", "11")
assert.equal(loaded?.tc, "未指明特別班，星期日及公眾假期班次，不經雪廠街，大坑徑，上課日加開班次，深夜班次")
assert.equal(loaded?.en, "Special not named, SUNDAY & PUBLIC HOLIDAY DEPARTURE, OMIT ICE HOUSE STREET, TAI HANG DRIVE, SCHOOL DAYS ADDITIONAL DEPARTURE, NIGHT TIME DEPARTURE")

console.log("citybus variant ok")
