export const SUN_ROUTES: { code: string; from: string; to: string; fromTc: string; fromEn: string; destTc: string; destEn: string }[] = [
  { code: "CECC", from: "sun-central", to: "sun-cheung-chau", fromTc: "中環", fromEn: "Central", destTc: "長洲", destEn: "Cheung Chau" },
  { code: "CCCE", from: "sun-cheung-chau", to: "sun-central", fromTc: "長洲", fromEn: "Cheung Chau", destTc: "中環", destEn: "Central" },
  { code: "CEMW", from: "sun-central", to: "sun-mui-wo", fromTc: "中環", fromEn: "Central", destTc: "梅窩", destEn: "Mui Wo" },
  { code: "MWCE", from: "sun-mui-wo", to: "sun-central", fromTc: "梅窩", fromEn: "Mui Wo", destTc: "中環", destEn: "Central" },
  { code: "NPHH", from: "sun-north-point", to: "sun-hung-hom", fromTc: "北角", fromEn: "North Point", destTc: "紅磡", destEn: "Hung Hom" },
  { code: "HHNP", from: "sun-hung-hom", to: "sun-north-point", fromTc: "紅磡", fromEn: "Hung Hom", destTc: "北角", destEn: "North Point" },
  { code: "NPKC", from: "sun-north-point", to: "sun-kowloon-city", fromTc: "北角", fromEn: "North Point", destTc: "九龍城", destEn: "Kowloon City" },
  { code: "KCNP", from: "sun-kowloon-city", to: "sun-north-point", fromTc: "九龍城", fromEn: "Kowloon City", destTc: "北角", destEn: "North Point" },
  { code: "IIPECMUW", from: "hkkf-peng-chau", to: "sun-mui-wo", fromTc: "坪洲", fromEn: "Peng Chau", destTc: "梅窩", destEn: "Mui Wo" },
  { code: "IIMUWPEC", from: "sun-mui-wo", to: "hkkf-peng-chau", fromTc: "梅窩", fromEn: "Mui Wo", destTc: "坪洲", destEn: "Peng Chau" },
  { code: "IIMUWCMW", from: "sun-mui-wo", to: "sun-chi-ma-wan", fromTc: "梅窩", fromEn: "Mui Wo", destTc: "芝麻灣", destEn: "Chi Ma Wan" },
  { code: "IICMWMUW", from: "sun-chi-ma-wan", to: "sun-mui-wo", fromTc: "芝麻灣", fromEn: "Chi Ma Wan", destTc: "梅窩", destEn: "Mui Wo" },
  { code: "IICMWCHC", from: "sun-chi-ma-wan", to: "sun-cheung-chau", fromTc: "芝麻灣", fromEn: "Chi Ma Wan", destTc: "長洲", destEn: "Cheung Chau" },
  { code: "IICHCCMW", from: "sun-cheung-chau", to: "sun-chi-ma-wan", fromTc: "長洲", fromEn: "Cheung Chau", destTc: "芝麻灣", destEn: "Chi Ma Wan" },
  { code: "IICHCMUW", from: "sun-cheung-chau", to: "sun-mui-wo", fromTc: "長洲", fromEn: "Cheung Chau", destTc: "梅窩", destEn: "Mui Wo" },
  { code: "IIMUWCHC", from: "sun-mui-wo", to: "sun-cheung-chau", fromTc: "梅窩", fromEn: "Mui Wo", destTc: "長洲", destEn: "Cheung Chau" },
]

export function ferryBadge(code: string): { tc: string; en: string } {
  if (code === "天星") return { tc: "天星", en: "Star Ferry" }
  if (code === "富裕") return { tc: "富裕小輪", en: "Fortune Ferry" }
  if (code.startsWith("II")) return { tc: "橫水渡", en: "Inter-island" }
  if (SUN_ROUTES.some((route) => route.code === code)) return { tc: "新渡輪", en: "Sun Ferry" }
  if (/^[1-4]$/.test(code)) return { tc: "港九小輪", en: "HK & Kowloon Ferry" }
  return { tc: "渡輪", en: "Ferry" }
}

export type FerryLocale = "zh-HK" | "zh-CN" | "en"
export type FerryHkUrlLocale = "zh-hk" | "zh-cn" | "en-hk"

export const FERRY_HK_ORIGIN = "https://ferry.hk"

const PIER_FERRY_HK_SLUG: Record<string, string> = {
  "star-central": "central",
  "star-tst": "tsim-sha-tsui",
  "star-wanchai": "wan-chai",
  "sun-central": "central",
  "sun-cheung-chau": "cheung-chau",
  "sun-mui-wo": "mui-wo",
  "sun-chi-ma-wan": "chi-ma-wan",
  "sun-north-point": "north-point",
  "fortune-kwun-tong": "kwun-tong",
  "sun-hung-hom": "hung-hom",
  "sun-kowloon-city": "kowloon-city",
  "hkkf-central": "central",
  "hkkf-central-6": "central",
  "hkkf-sok-kwu-wan": "sok-kwu-wan",
  "hkkf-yung-shue-wan": "yung-shue-wan",
  "hkkf-peng-chau": "peng-chau",
  "hkkf-hei-ling-chau": "hei-ling-chau",
}

const PLACE_FERRY_HK_SLUG: Record<string, string> = {
  central: "central",
  "中環": "central",
  "tsim sha tsui": "tsim-sha-tsui",
  "尖沙咀": "tsim-sha-tsui",
  "wan chai": "wan-chai",
  "灣仔": "wan-chai",
  "cheung chau": "cheung-chau",
  "長洲": "cheung-chau",
  "mui wo": "mui-wo",
  "梅窩": "mui-wo",
  "chi ma wan": "chi-ma-wan",
  "芝麻灣": "chi-ma-wan",
  "north point": "north-point",
  "北角": "north-point",
  "kwun tong": "kwun-tong",
  "觀塘": "kwun-tong",
  "kai tak": "kai-tak",
  "啟德": "kai-tak",
  "hung hom": "hung-hom",
  "紅磡": "hung-hom",
  "kowloon city": "kowloon-city",
  "九龍城": "kowloon-city",
  "sok kwu wan": "sok-kwu-wan",
  "索罟灣": "sok-kwu-wan",
  "yung shue wan": "yung-shue-wan",
  "榕樹灣": "yung-shue-wan",
  "peng chau": "peng-chau",
  "坪洲": "peng-chau",
  "hei ling chau": "hei-ling-chau",
  "喜靈洲": "hei-ling-chau",
}

export function ferryHkLocale(locale: FerryLocale): FerryHkUrlLocale {
  if (locale === "en") return "en-hk"
  if (locale === "zh-CN") return "zh-cn"
  return "zh-hk"
}

export function ferryHkPierSlug(pierId: string): string | null {
  return PIER_FERRY_HK_SLUG[pierId] ?? null
}

export function ferryHkPlaceSlug(placeEn: string, placeTc = ""): string | null {
  const enKey = placeEn.trim().toLowerCase()
  if (enKey && PLACE_FERRY_HK_SLUG[enKey]) return PLACE_FERRY_HK_SLUG[enKey]
  const tcKey = placeTc.trim()
  if (tcKey && PLACE_FERRY_HK_SLUG[tcKey]) return PLACE_FERRY_HK_SLUG[tcKey]
  return null
}

export function ferryHkPierUrl(locale: FerryLocale, pierId: string): string {
  const lang = ferryHkLocale(locale)
  const slug = ferryHkPierSlug(pierId)
  return slug ? `${FERRY_HK_ORIGIN}/${lang}/${slug}` : `${FERRY_HK_ORIGIN}/${lang}`
}

export function ferryHkRouteUrl(locale: FerryLocale, fromSlug: string, toSlug: string): string | null {
  if (!fromSlug || !toSlug || fromSlug === toSlug) return null
  return `${FERRY_HK_ORIGIN}/${ferryHkLocale(locale)}/${fromSlug}/${toSlug}`
}

function vesselRouteSlugs(info: { route?: string; nameEn?: string; nameTc?: string }): [string, string] | null {
  if (info.route) {
    const sun = SUN_ROUTES.find((item) => item.code === info.route)
    if (sun) {
      const from = ferryHkPierSlug(sun.from)
      const to = ferryHkPierSlug(sun.to)
      if (from && to && from !== to) return [from, to]
    }
  }
  for (const label of [info.nameEn, info.nameTc]) {
    if (!label) continue
    const parts = label.split(/\s*[–—-]\s*/)
    if (parts.length !== 2) continue
    const from = ferryHkPlaceSlug(parts[0] ?? "", parts[0] ?? "")
    const to = ferryHkPlaceSlug(parts[1] ?? "", parts[1] ?? "")
    if (from && to && from !== to) return [from, to]
  }
  return null
}

export function ferryHkVesselUrl(locale: FerryLocale, info: { route?: string; nameEn?: string; nameTc?: string }): string {
  const pair = vesselRouteSlugs(info)
  if (pair) return `${FERRY_HK_ORIGIN}/${ferryHkLocale(locale)}/${pair[0]}/${pair[1]}`
  return `${FERRY_HK_ORIGIN}/${ferryHkLocale(locale)}`
}

export function ferryHkCallUrl(
  locale: FerryLocale,
  pierId: string,
  call: { route?: string; arriving?: boolean; destTc?: string; destEn?: string; originTc?: string; originEn?: string },
  vesselName?: { nameEn?: string; nameTc?: string },
): string | null {
  const pierSlug = ferryHkPierSlug(pierId)
  if (pierSlug) {
    if (call.arriving) {
      const origin = ferryHkPlaceSlug(call.originEn ?? "", call.originTc ?? "")
      return origin ? ferryHkRouteUrl(locale, origin, pierSlug) : null
    }
    const dest = ferryHkPlaceSlug(call.destEn ?? "", call.destTc ?? "")
    return dest ? ferryHkRouteUrl(locale, pierSlug, dest) : null
  }
  const pair = vesselRouteSlugs({ route: call.route, nameEn: vesselName?.nameEn, nameTc: vesselName?.nameTc })
  return pair ? ferryHkRouteUrl(locale, pair[0], pair[1]) : null
}

// A departure names where the boat is going. An arrival names where it came from.
// The route code stays off the card.
export function ferryLeg(call: {
  arriving?: boolean
  destTc?: string
  destEn?: string
  originTc?: string
  originEn?: string
}): { arriving: boolean; tc: string; en: string } | null {
  const tc = call.arriving ? call.originTc ?? "" : call.destTc ?? ""
  const en = call.arriving ? call.originEn ?? "" : call.destEn ?? ""
  if (!tc && !en) return null
  return { arriving: call.arriving === true, tc, en }
}
