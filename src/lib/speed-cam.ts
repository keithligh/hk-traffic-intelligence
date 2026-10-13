import { PLACE_POLL_MS } from "./kmb-view.ts"
import { fetchUpstream } from "./upstream.ts"

export const SPEED_CAM_POLL_MS = PLACE_POLL_MS

export type SpeedCamResponse = {
  ok: boolean
  error?: string
  cameras: GeoJSON.FeatureCollection
}

const SEC_QUERY = "https://portal.csdi.gov.hk/server/rest/services/common/td_rcd_1671693428549_89372/MapServer/0/query"
const RLC_QUERY = "https://portal.csdi.gov.hk/server/rest/services/common/td_rcd_1671693287017_1644/MapServer/0/query"

let cached: { expires: number; features: GeoJSON.FeatureCollection } | null = null

export function parseSpeedCameras(body: unknown): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  if (!body || typeof body !== "object" || !("features" in body) || !Array.isArray(body.features)) {
    return { type: "FeatureCollection", features }
  }
  for (const item of body.features) {
    const feature = featureOf(item)
    if (feature) features.push(feature)
  }
  return { type: "FeatureCollection", features }
}

export async function loadSpeedCameras(): Promise<GeoJSON.FeatureCollection | null> {
  if (cached && cached.expires > Date.now()) return cached.features
  try {
    const [speed, lights] = await Promise.all([readPages(SEC_QUERY), readPages(RLC_QUERY)])
    if (!speed || !lights) {
      const partial = parseSpeedCameras({ features: [...(speed ?? []), ...(lights ?? [])] })
      return partial.features.length > 0 ? partial : cached?.features ?? null
    }
    const features = parseSpeedCameras({ features: [...speed, ...lights] })
    if (features.features.length === 0) return cached?.features ?? null
    cached = { expires: Date.now() + SPEED_CAM_POLL_MS, features }
    return features
  } catch {
    return cached?.features ?? null
  }
}

async function readPages(root: string): Promise<unknown[] | null> {
  const pages: unknown[] = []
  let offset = 0
  for (let page = 0; page < 8; page += 1) {
    const response = await fetchUpstream(queryUrl(root, offset), SPEED_CAM_POLL_MS, {
      timeoutMs: 20_000,
      headers: { Accept: "application/json" },
    })
    if (response.status !== 200) return null
    const body = JSON.parse(new TextDecoder().decode(response.body).replace(/^\uFEFF/, "")) as unknown
    pages.push(body)
    const count = featureCount(body)
    if (count === 0 || !transferLimited(body)) break
    offset += count
  }
  return pages.flatMap((page) => featureList(page))
}

function queryUrl(root: string, offset: number): string {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "OBJECTID,PopupInfo",
    returnGeometry: "true",
    f: "json",
    resultRecordCount: "200",
    resultOffset: String(offset),
  })
  return `${root}?${params.toString()}`
}

function featureOf(item: unknown): GeoJSON.Feature | null {
  if (!item || typeof item !== "object") return null
  const row = item as { attributes?: unknown; geometry?: unknown }
  const geometry = row.geometry
  if (!geometry || typeof geometry !== "object") return null
  const point = geometry as { x?: unknown; y?: unknown }
  const lng = typeof point.x === "number" ? point.x : Number.NaN
  const lat = typeof point.y === "number" ? point.y : Number.NaN
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  if (lng < 113.5 || lng > 114.6 || lat < 22.1 || lat > 22.7) return null
  const attributes = row.attributes
  const popup = attributes && typeof attributes === "object" ? (attributes as { PopupInfo?: unknown }).PopupInfo : ""
  const fields = fieldsOf(typeof popup === "string" ? popup : "")
  const id = fields.SEC_ID || (fields.RLC_ID ? `rlc-${fields.RLC_ID}` : "")
  const name = fields.SITE_DESC_ENG ?? ""
  const nameTc = fields.SITE_DESC_CHI ?? ""
  if (!id || (!name && !nameTc)) return null
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {
      id,
      name,
      nameTc,
      nameSc: fields.SITE_DESC_SCHI ?? "",
      remarks: fields.REMARKS ?? "",
    },
  }
}

function fieldsOf(popup: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const field = /<th>\s*([A-Z0-9_]+)\s*<\/th>\s*<td>([\s\S]*?)<\/td>/g
  for (const match of popup.matchAll(field)) {
    const key = match[1]
    const value = match[2]?.replace(/<[^>]+>/g, "").trim() ?? ""
    if (key) fields[key] = value
  }
  return fields
}

function featureList(body: unknown): unknown[] {
  if (!body || typeof body !== "object" || !("features" in body) || !Array.isArray(body.features)) return []
  return body.features
}

function featureCount(body: unknown): number {
  return featureList(body).length
}

function transferLimited(body: unknown): boolean {
  return Boolean(body && typeof body === "object" && "exceededTransferLimit" in body && body.exceededTransferLimit === true)
}
