import assert from "node:assert/strict"
import piersFile from "../../data/ferry-piers.json" with { type: "json" }
import {
  SUN_ROUTES,
  ferryBadge,
  ferryHkCallUrl,
  ferryHkLocale,
  ferryHkPierSlug,
  ferryHkPierUrl,
  ferryHkVesselUrl,
  ferryLeg,
} from "./ferry-routes.ts"

const SPEC = [
  "CECC",
  "CCCE",
  "CEMW",
  "MWCE",
  "NPHH",
  "HHNP",
  "NPKC",
  "KCNP",
  "IIPECMUW",
  "IIMUWPEC",
  "IIMUWCMW",
  "IICMWMUW",
  "IICMWCHC",
  "IICHCCMW",
  "IICHCMUW",
  "IIMUWCHC",
]

assert.deepEqual(SUN_ROUTES.map((route) => route.code), SPEC)

const pierIds = new Set(piersFile.piers.map((pier) => pier.id))
for (const route of SUN_ROUTES) {
  assert.ok(pierIds.has(route.from), route.from)
  assert.ok(pierIds.has(route.to), route.to)
}

assert.equal(ferryBadge("IICMWCHC").tc, "橫水渡")
assert.equal(ferryBadge("IICMWCHC").en, "Inter-island")
assert.equal(ferryBadge("CECC").tc, "新渡輪")
assert.equal(ferryBadge("1").tc, "港九小輪")
assert.equal(ferryBadge("1").en, "HK & Kowloon Ferry")
assert.equal(ferryBadge("天星").tc, "天星")
assert.equal(ferryBadge("富裕").tc, "富裕小輪")
assert.equal(ferryBadge("富裕").en, "Fortune Ferry")
assert.equal(ferryBadge("IICMWCHC").tc.includes("IICMWCHC"), false)
assert.equal(ferryBadge("NOTACODE").tc, "渡輪")
assert.equal(ferryBadge("NOTACODE").en.includes("NOTACODE"), false)

const chiMaWan = SUN_ROUTES.find((route) => route.code === "IICMWCHC")
assert.ok(chiMaWan)
assert.deepEqual(ferryLeg({ arriving: false, destTc: chiMaWan.destTc, destEn: chiMaWan.destEn }), {
  arriving: false,
  tc: "長洲",
  en: "Cheung Chau",
})
assert.deepEqual(ferryLeg({ arriving: true, originTc: chiMaWan.fromTc, originEn: chiMaWan.fromEn, destTc: chiMaWan.destTc, destEn: chiMaWan.destEn }), {
  arriving: true,
  tc: "芝麻灣",
  en: "Chi Ma Wan",
})
assert.equal(ferryLeg({ arriving: true, destTc: "長洲", destEn: "Cheung Chau" }), null)
assert.equal(JSON.stringify(ferryLeg({ arriving: false, destTc: "長洲", destEn: "Cheung Chau" })).includes("IICMWCHC"), false)

assert.equal(ferryHkLocale("en"), "en-hk")
assert.equal(ferryHkLocale("zh-HK"), "zh-hk")
assert.equal(ferryHkLocale("zh-CN"), "zh-cn")

for (const pier of piersFile.piers) {
  const slug = ferryHkPierSlug(pier.id)
  assert.ok(slug, `missing ferry.hk slug for pier ${pier.id}`)
  assert.equal(ferryHkPierUrl("en", pier.id), `https://ferry.hk/en-hk/${slug}`)
  assert.equal(ferryHkPierUrl("zh-HK", pier.id), `https://ferry.hk/zh-hk/${slug}`)
  assert.equal(ferryHkPierUrl("zh-CN", pier.id), `https://ferry.hk/zh-cn/${slug}`)
}
assert.equal(ferryHkPierUrl("en", "unknown-pier"), "https://ferry.hk/en-hk")

assert.equal(
  ferryHkCallUrl("en", "sun-central", { route: "CECC", arriving: false, destEn: "Cheung Chau", destTc: "長洲" }),
  "https://ferry.hk/en-hk/central/cheung-chau",
)
assert.equal(
  ferryHkCallUrl("zh-HK", "sun-cheung-chau", { route: "CECC", arriving: true, originEn: "Central", originTc: "中環" }),
  "https://ferry.hk/zh-hk/central/cheung-chau",
)
assert.equal(
  ferryHkCallUrl("zh-CN", "star-central", { route: "天星", arriving: false, destEn: "Tsim Sha Tsui", destTc: "尖沙咀" }),
  "https://ferry.hk/zh-cn/central/tsim-sha-tsui",
)
assert.equal(
  ferryHkCallUrl("en", "fortune-kwun-tong", { route: "富裕", arriving: false, destEn: "Kai Tak", destTc: "啟德" }),
  "https://ferry.hk/en-hk/kwun-tong/kai-tak",
)
assert.equal(
  ferryHkVesselUrl("en", { route: "CEMW", nameEn: "Central – Mui Wo", nameTc: "中環 – 梅窩" }),
  "https://ferry.hk/en-hk/central/mui-wo",
)
assert.equal(
  ferryHkVesselUrl("zh-HK", { route: "4", nameEn: "Peng Chau – Hei Ling Chau", nameTc: "坪洲 – 喜靈洲" }),
  "https://ferry.hk/zh-hk/peng-chau/hei-ling-chau",
)
assert.equal(
  ferryHkVesselUrl("zh-CN", { route: "富裕", nameEn: "Kwun Tong – Kai Tak", nameTc: "觀塘 – 啟德" }),
  "https://ferry.hk/zh-cn/kwun-tong/kai-tak",
)
assert.equal(
  ferryHkVesselUrl("zh-HK", { route: "UNKNOWN", nameEn: "Unknown" }),
  "https://ferry.hk/zh-hk",
)
