import assert from "node:assert/strict"
import { citybusVariantCopy } from "./citybus-variant.ts"

const unnamed = { tc: "到站時間未有說明是哪一個特別班", en: "The arrival feed does not say which special this is" }
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
assert.equal(mixed?.tc, "到站時間未有說明是哪一個特別班，星期日及公眾假期班次，不經雪廠街")
assert.equal(mixed?.en, "The arrival feed does not say which special this is, Sundays and public holidays, skips Ice House Street")

console.log("citybus variant ok")
