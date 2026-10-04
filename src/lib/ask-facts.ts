import { jammedRoads } from "./briefing-facts.ts"
import { controlName } from "./i18n.ts"
import type { ApproachPoint, Corridor, SpeedSummary, WeatherConditions } from "./types.ts"

// The facts a question is answered from: more detail than the briefing, so a question about
// one start, one road or one boundary hall can be answered, and nothing the feeds do not say.

export type AskInput = {
  at: Date
  traffic: { ok: boolean; corridors: Corridor[]; summary: SpeedSummary } | null
  starts: ApproachPoint[]
  incidents: { tc: string; en: string; whereTc: string; whereEn: string }[]
  warnings: { name: string }[]
  conditions: WeatherConditions | null
  halls: GeoJSON.Feature[] | null
}

const TUNNEL: Record<string, string> = {
  CH: "Cross-Harbour Tunnel (紅隧)",
  EH: "Eastern Harbour Crossing (東隧)",
  WH: "Western Harbour Crossing (西隧)",
}

// Immigration Department queue codes, as the intel panel reads them.
const QUEUE: Record<number, string> = { 0: "normal", 1: "busy", 2: "very busy", 4: "under maintenance", 99: "closed" }
const HALLS = [
  ["residentArrCode", "residents arriving"],
  ["residentDepCode", "residents departing"],
  ["visitorArrCode", "visitors arriving"],
  ["visitorDepCode", "visitors departing"],
] as const

const HK_OFFSET_MS = 8 * 3_600_000

// Fixed reference for the HKeMobility journey-time starts: the side of the harbour and the
// districts each one is the nearest published start for. The model guessed geography badly
// without it (it put Tseung Kwan O on Hong Kong Island). Western New Territories traffic comes
// in by Waterloo Road, the nearest start with all three tunnels.
const ISLAND = "Hong Kong Island"
const KOWLOON = "the Kowloon side"
const START_AREAS: Record<string, { side: string; areas: string }> = {
  H1: { side: ISLAND, areas: "灣仔 Wan Chai, 金鐘 Admiralty, 中環 Central, 上環 Sheung Wan, 西環 Western District" },
  H2: { side: ISLAND, areas: "銅鑼灣 Causeway Bay, 香港仔 Aberdeen, 黃竹坑 Wong Chuk Hang, 薄扶林 Pok Fu Lam, 淺水灣 Repulse Bay, 赤柱 Stanley" },
  H3: { side: ISLAND, areas: "北角 North Point, 炮台山 Fortress Hill, 天后 Tin Hau" },
  H4: { side: ISLAND, areas: "跑馬地 Happy Valley, 灣仔南 south Wan Chai" },
  H11: { side: ISLAND, areas: "鰂魚涌 Quarry Bay, 太古 Tai Koo, 西灣河 Sai Wan Ho, 筲箕灣 Shau Kei Wan, 柴灣 Chai Wan" },
  K02: { side: KOWLOON, areas: "尖沙咀 Tsim Sha Tsui, 紅磡 Hung Hom, 佐敦 Jordan, 油麻地 Yau Ma Tei, 土瓜灣 To Kwa Wan" },
  K03: {
    side: KOWLOON,
    areas: "旺角 Mong Kok, 何文田 Ho Man Tin, 九龍塘 Kowloon Tong, 九龍城 Kowloon City, 深水埗 Sham Shui Po, 沙田 Sha Tin, 大埔 Tai Po, 荃灣 Tsuen Wan, 葵涌 Kwai Chung, 屯門 Tuen Mun, 元朗 Yuen Long",
  },
  K08: { side: KOWLOON, areas: "九龍灣 Kowloon Bay, 觀塘 Kwun Tong, 牛頭角 Ngau Tau Kok, 藍田 Lam Tin, 新蒲崗 San Po Kong, 黃大仙 Wong Tai Sin, 將軍澳 Tseung Kwan O, 西貢 Sai Kung" },
}

export function askFacts(input: AskInput): string {
  const lines = [`Time: ${new Date(input.at.getTime() + HK_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ")} Hong Kong time`]
  const summary = input.traffic?.ok ? input.traffic.summary : null
  lines.push(
    summary && summary.meanSpeedKmh != null
      ? `Road network: mean ${Math.round(summary.meanSpeedKmh)} km/h; segments free ${summary.free}, slow ${summary.slow}, congested ${summary.congested}`
      : "Road network: no reading",
  )
  const crossingLines = input.starts.flatMap((start) => {
    const legs = start.legs.filter((leg) => leg.code in TUNNEL && leg.minutes != null)
    if (legs.length === 0) return []
    return [`Harbour crossing times from ${start.nameTc} (${start.name}): ${legs.map((leg) => `${TUNNEL[leg.code]} ${leg.minutes} min`).join(", ")}`]
  })
  lines.push(...(crossingLines.length > 0 ? crossingLines : ["Harbour crossing times: no reading"]))
  for (const start of input.starts) {
    const area = START_AREAS[start.id]
    if (!area || !start.legs.some((leg) => leg.code in TUNNEL && leg.minutes != null)) continue
    // One line per district, so an answer can quote it whole instead of cutting a list.
    for (const district of area.areas.split(", ")) {
      lines.push(`Reference, fixed: ${district} is on ${area.side}; nearest start ${start.nameTc}`)
    }
  }
  const jams = input.traffic?.ok ? jammedRoads(input.traffic.corridors, 8) : []
  lines.push(
    jams.length > 0
      ? `Congested roads, longest first: ${jams.map((road) => `${road.tc} ${road.en} ${road.km} km, slowest ${road.slowestKmh} km/h`).join("; ")}`
      : "Congested roads: none",
  )
  // Stated even when empty: unlike the briefing, a question about them needs to hear "none".
  lines.push(
    `Open traffic incidents: ${input.incidents.length > 0 ? input.incidents.map((row) => `${row.tc} ${row.en} at ${row.whereTc} ${row.whereEn}`.replace(/\s+/g, " ").trim()).join("; ") : "none"}`,
  )
  lines.push(`Weather warnings now in effect: ${input.warnings.length > 0 ? input.warnings.map((row) => row.name).join("; ") : "none"}`)
  if (input.conditions?.temperatureC != null) {
    const rain = input.conditions.rainfallMm == null ? "" : `, rainfall in the past hour ${input.conditions.rainfallMm} mm`
    lines.push(`Weather: ${input.conditions.temperatureC}°C${rain}`)
  }
  if (!input.halls) {
    lines.push("Boundary control points: no reading")
  } else {
    lines.push("Boundary halls: arriving means entering Hong Kong; departing means leaving Hong Kong for the Mainland; normal, busy and very busy describe how crowded each hall's queue is")
    for (const hall of input.halls) {
      const p = (hall.properties ?? {}) as Record<string, unknown>
      const code = String(p.code ?? "")
      const english = String(p.name ?? code)
      const states = HALLS.map(([key, label]) => [label, QUEUE[Number(p[key])] ?? "no reading"] as const)
      const status = states.every(([, state]) => state === "normal") ? "all four halls normal (residents and visitors, arriving and departing)" : states.map(([label, state]) => `${label} ${state}`).join(", ")
      lines.push(`Boundary control point ${controlName("zh-HK", code, english)} (${english}): ${status}`)
    }
  }
  return lines.join("\n")
}
