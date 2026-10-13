import { parseCsv } from "@/lib/csv"
import { jsonResponse } from "@/lib/json-response"
import { fetchUpstream } from "@/lib/upstream"
import { buildCorridors, laneSpeed, type DetectorSite } from "@/lib/corridors"
import { fetchText } from "@/lib/fetch-text"
import { speedReadingComplete, speedReadingTtl } from "@/lib/speed"
import {
  corridorsFromSegments,
  lamppostCorridors,
  loadCenterlines,
  summarizeCorridors,
  type LamppostSite,
} from "@/lib/segments"
import type { Corridor, NetworkStatus, SegmentSummary, SpeedSummary, TrafficResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

const LOCATIONS =
  "https://static.data.gov.hk/td/traffic-data-strategic-major-roads/info/traffic_speed_volume_occ_info.csv"
const RAW_SPEEDS = "https://resource.data.one.gov.hk/td/traffic-detectors/rawSpeedVol-all.xml"
const SEGMENT_SPEEDS = "https://resource.data.one.gov.hk/td/traffic-detectors/irnAvgSpeed-all.xml"
const NETWORK_DATE = "https://static.data.gov.hk/td/road-network-v2/DATA_LAST_UPDATED_DATE.csv"
const LAMPPOSTS = "https://static.data.gov.hk/td/traffic-data-slp/info/traffic_speed_volume_occ_info-slp.csv"
const LAMPPOST_SPEEDS = "https://resource.data.one.gov.hk/td/traffic-detectors/rawSpeedVol_SLP-all.xml"
const SATURATION_URL =
  "https://www.hkemobility.gov.hk/api/drss/layer/map?service=WFS&version=1.0.0&request=GetFeature&typeName=DRSS:VW_IRN_AVG_SPEED_MAP&outputFormat=application/json&propertyName=SEGMENT_ID,ROAD_SATURATION_LEVEL"

const NETWORK_DRAWN =
  "Strategic-road colours follow the official traffic class, good, average, or bad, on the 2nd-generation centreline. Each live segment id is that centreline's ROUTE_ID. Smart-lamppost speeds are drawn as separate points."
const NETWORK_FALLBACK =
  "The centreline file was not available, so speeds are traced through detector coordinates."

function emptySummary(): SpeedSummary {
  return {
    corridorCount: 0,
    detectorCount: 0,
    meanSpeedKmh: null,
    free: 0,
    slow: 0,
    congested: 0,
    unknown: 0,
  }
}

function failedSegments(error: string): SegmentSummary {
  return {
    ok: false,
    error,
    observedAt: null,
    validCount: 0,
    invalidCount: 0,
    meanSpeedKmh: null,
  }
}

function failedNetwork(error?: string): NetworkStatus {
  return {
    ok: false,
    error,
    revisionDate: null,
    usedOnMap: false,
    reason: NETWORK_FALLBACK,
  }
}

const SPEED_HOLD_MS = 2_500

let pending: Promise<{ body: TrafficResponse; complete: boolean }> | null = null
let cached: { at: number; ttl: number; body: TrafficResponse } | null = null

export async function GET(request: Request) {
  const simulate = new URL(request.url).searchParams.get("simulate")
  if (simulate === "fail") {
    const body: TrafficResponse = {
      ok: false,
      error:
        "Speed feed was forced down for this view. The satellite map does not depend on it.",
      observedAt: null,
      corridors: [],
      summary: emptySummary(),
      segments: failedSegments("Skipped while the speed request is forced down."),
      network: {
        ok: true,
        revisionDate: null,
        usedOnMap: false,
        reason: NETWORK_FALLBACK,
      },
    }
    return jsonResponse(request, body, 502)
  }

  const now = Date.now()
  if (cached && now - cached.at < cached.ttl) return jsonResponse(request, cached.body)
  pending ??= loadTraffic().finally(() => {
    pending = null
  })
  try {
    const reading = await pending
    const body = reading.body
    if (body.ok) cached = { at: Date.now(), ttl: speedReadingTtl(reading.complete), body }
    else if (cached) return jsonResponse(request, cached.body)
    return jsonResponse(request, body, body.ok ? 200 : 502)
  } catch (error) {
    if (cached) return jsonResponse(request, cached.body)
    const body: TrafficResponse = {
      ok: false,
      error: error instanceof Error ? error.message : "Speed feed failed",
      observedAt: null,
      corridors: [],
      summary: emptySummary(),
      segments: failedSegments("Speed feed failed."),
      network: failedNetwork(),
    }
    return jsonResponse(request, body, 502)
  }
}

async function loadTraffic(): Promise<{ body: TrafficResponse; complete: boolean }> {
  const [locations, raw, segments, network, centerlines, lampposts, lamppostSpeeds, saturation] =
    await Promise.all([
      settle(fetchText(LOCATIONS, 6 * 60 * 60 * 1000)),
      settle(fetchText(RAW_SPEEDS, 45_000)),
      settle(fetchText(SEGMENT_SPEEDS, 45_000)),
      settle(fetchText(NETWORK_DATE, 6 * 60 * 60 * 1000)),
      settle(loadCenterlines()),
      held(fetchText(LAMPPOSTS, 6 * 60 * 60 * 1000), SPEED_HOLD_MS),
      held(fetchText(LAMPPOST_SPEEDS, 45_000), SPEED_HOLD_MS),
      held(loadSaturation(), SPEED_HOLD_MS),
    ])

  const segmentParsed = segments.status === "fulfilled" ? parseSegments(segments.value) : null
  const rawParsed = raw.status === "fulfilled" ? parseRawSpeeds(raw.value) : null
  const lamppostParsed = lamppostSpeeds.status === "fulfilled" ? parseRawSpeeds(lamppostSpeeds.value) : null
  const lamppostSites = lampposts.status === "fulfilled" ? parseLampposts(lampposts.value) : null
  const segmentSummary = segmentParsed
    ? segmentParsed.summary
    : failedSegments(segments.status === "rejected" ? reason(segments) : "Segment speeds were empty.")
  const drawn =
    centerlines.status === "fulfilled" && segmentParsed && segmentParsed.byId.size > 0
      ? drawnFromNetwork(
          centerlines.value,
          segmentParsed.byId,
          saturation.status === "fulfilled" ? saturation.value : new Map(),
          lamppostSites,
          lamppostParsed?.byId ?? null,
        )
      : null

  if (!drawn && (locations.status === "rejected" || raw.status === "rejected")) {
    const body: TrafficResponse = {
      ok: false,
      error: [locations, raw]
        .flatMap((result) => (result.status === "rejected" ? [reason(result)] : []))
        .join(" "),
      observedAt: null,
      corridors: [],
      summary: emptySummary(),
      segments: segmentSummary,
      network: networkStatusFrom(network, false),
    }
    return { body, complete: false }
  }

  const detector =
    drawn || locations.status === "rejected" || !rawParsed
      ? null
      : buildCorridors(parseSites(locations.value), rawParsed.byId)
  const lamppostOnly =
    drawn || !lamppostSites || !lamppostParsed
      ? []
      : lamppostCorridors(lamppostSites, lamppostParsed.byId)
  const corridors = drawn?.corridors ?? [...(detector?.corridors ?? []), ...lamppostOnly]
  const summary =
    drawn?.summary ??
    summarizeCorridors(corridors, (detector?.summary.detectorCount ?? 0) + lamppostOnly.length)
  const observedAt = drawn
    ? segmentSummary.observedAt
    : locations.status === "fulfilled" && rawParsed
      ? rawParsed.observedAt
      : null
  const body: TrafficResponse = {
    ok: corridors.length > 0,
    observedAt,
    corridors,
    summary,
    segments: segmentSummary,
    network: networkStatusFrom(network, Boolean(drawn)),
  }
  const complete = speedReadingComplete(
    drawn != null,
    lampposts.status === "fulfilled",
    lamppostSpeeds.status === "fulfilled",
    saturation.status === "fulfilled",
  )
  return { body, complete }
}

function drawnFromNetwork(
  lines: Awaited<ReturnType<typeof loadCenterlines>>,
  speeds: Map<string, number | null>,
  saturation: Map<string, string>,
  lamppostSites: LamppostSite[] | null,
  lamppostSpeeds: Map<string, number | null> | null,
): { corridors: Corridor[]; summary: SpeedSummary } {
  const segments = corridorsFromSegments(lines, speeds, saturation)
  const points =
    lamppostSites && lamppostSpeeds ? lamppostCorridors(lamppostSites, lamppostSpeeds) : []
  const corridors = [...segments, ...points]
  return {
    corridors,
    summary: summarizeCorridors(corridors, points.length),
  }
}

let saturationCache: { expires: number; levels: Map<string, string> } | null = null

function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value) => ({ status: "fulfilled", value }),
    (reason) => ({ status: "rejected", reason }),
  )
}

function held<T>(promise: Promise<T>, ms: number): Promise<PromiseSettledResult<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ status: "rejected", reason: new Error("continued without this file") })
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve({ status: "fulfilled", value })
      },
      (reason) => {
        clearTimeout(timer)
        resolve({ status: "rejected", reason })
      },
    )
  })
}

async function loadSaturation(): Promise<Map<string, string>> {
  if (saturationCache && saturationCache.expires > Date.now()) return saturationCache.levels
  const response = await fetchUpstream(SATURATION_URL, 60_000, {
    timeoutMs: 8_000,
    headers: {
      Accept: "application/json",
      Referer: "https://www.hkemobility.gov.hk/en/",
    },
  })
  if (response.status !== 200) throw new Error(`HTTP ${response.status} from the traffic class feed`)
  const payload: unknown = JSON.parse(new TextDecoder().decode(response.body))
  const levels = new Map<string, string>()
  if (isFeatureCollection(payload)) {
    for (const feature of payload.features) {
      const properties = feature.properties
      if (!properties) continue
      const id = properties.SEGMENT_ID
      const level = properties.ROAD_SATURATION_LEVEL
      if (typeof id !== "string" && typeof id !== "number") continue
      if (typeof level !== "string" || level.length === 0) continue
      levels.set(String(id), level)
    }
  }
  saturationCache = { expires: Date.now() + 60_000, levels }
  return levels
}

function isFeatureCollection(value: unknown): value is {
  features: { properties: Record<string, unknown> | null }[]
} {
  if (typeof value !== "object" || value === null || !("features" in value)) return false
  return Array.isArray(value.features)
}

function reason(result: PromiseRejectedResult): string {
  return result.reason instanceof Error ? result.reason.message : "Request failed"
}

function parseSites(csv: string): DetectorSite[] {
  return parseCsv(csv).flatMap((row) => {
    const lat = Number(row.Latitude)
    const lng = Number(row.Longitude)
    const id = row.AID_ID_Number
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return []
    return [
      {
        id,
        roadTc: row.Road_TC ?? "",
        roadEn: row.Road_EN ?? "",
        lat,
        lng,
        direction: row.Direction ?? "",
      },
    ]
  })
}

function parseRawSpeeds(xml: string): { observedAt: string | null; byId: Map<string, number | null> } {
  const date = xml.match(/<date>([^<]+)<\/date>/)?.[1] ?? null
  const from = xml.match(/<period_from>([^<]+)<\/period_from>/)?.[1] ?? null
  const byId = new Map<string, number | null>()
  for (const block of xml.split("<detector>").slice(1)) {
    const id = block.match(/<detector_id>([^<]+)<\/detector_id>/)?.[1]
    if (!id) continue
    const lanes = [...block.matchAll(
      /<speed>([^<]*)<\/speed>\s*<occupancy>[^<]*<\/occupancy>\s*<volume>([^<]*)<\/volume>[\s\S]*?<valid>([YN])<\/valid>/g,
    )].map((match) => ({
      speed: Number(match[1]),
      volume: Number(match[2]),
      valid: match[3] === "Y",
    }))
    byId.set(id, laneSpeed(lanes))
  }
  return { observedAt: date && from ? `${date} ${from}` : date, byId }
}

function parseSegments(xml: string): { summary: SegmentSummary; byId: Map<string, number | null> } {
  const date = xml.match(/<date>([^<]+)<\/date>/)?.[1] ?? null
  const time = xml.match(/<time>([^<]+)<\/time>/)?.[1] ?? null
  const byId = new Map<string, number | null>()
  let validSum = 0
  let validCount = 0
  let invalidCount = 0
  for (const match of xml.matchAll(
    /<segment_id>([^<]+)<\/segment_id>\s*<speed>([^<]*)<\/speed>\s*<valid>([YN])<\/valid>/g,
  )) {
    const speed = Number(match[2])
    if (match[3] !== "Y" || !Number.isFinite(speed)) {
      invalidCount += 1
      byId.set(match[1], null)
      continue
    }
    validSum += speed
    validCount += 1
    byId.set(match[1], speed)
  }
  return {
    summary: {
      ok: true,
      observedAt: date && time ? `${date} ${time}` : date,
      validCount,
      invalidCount,
      meanSpeedKmh: validCount > 0 ? validSum / validCount : null,
    },
    byId,
  }
}

function parseLampposts(csv: string): LamppostSite[] {
  return parseCsv(csv).flatMap((row) => {
    const lat = Number(row.Latitude)
    const lng = Number(row.Longitude)
    const id = row.AID_ID_Number
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return []
    return [
      {
        id,
        roadTc: stripAid(row.Road_TC ?? ""),
        roadEn: stripAid(row.Road_EN ?? ""),
        lat,
        lng,
        direction: row.Direction ?? "",
      },
    ]
  })
}

function stripAid(name: string): string {
  return name.replace(/\s*\[[^\]]+\]\s*$/, "").trim()
}

function networkStatusFrom(result: PromiseSettledResult<string>, usedOnMap: boolean): NetworkStatus {
  if (result.status === "rejected") return failedNetwork(reason(result))
  const date = result.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^\d{4}-\d{2}-\d{2}$/.test(line))
  return {
    ok: true,
    revisionDate: date ?? null,
    usedOnMap,
    reason: usedOnMap ? NETWORK_DRAWN : NETWORK_FALLBACK,
  }
}
