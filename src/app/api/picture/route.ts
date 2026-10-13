import {
  CAMERA_LAYER_MS,
  PICTURE_POLL_MS,
  TOLL_LAYER_MS,
  WORKS_LAYER_MS,
  camerasFromWfs,
  tollsFromWfs,
  withPortalCameras,
  withTraditionalText,
  worksFromWfs,
} from "@/lib/picture"
import { fillWorksChinese } from "@/lib/works-chinese"
import { fetchUpstream } from "@/lib/upstream"
import { jsonResponse } from "@/lib/json-response"
import type { PictureResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

const REFERER = "https://www.hkemobility.gov.hk/en/"

type PicturePart = "all" | "cameras" | "works"

let caches: Partial<Record<PicturePart, { expires: number; body: PictureResponse }>> = {}
const layers = new Map<string, { expires: number; features: GeoJSON.FeatureCollection }>()

export async function GET(request: Request) {
  const part = picturePart(new URL(request.url).searchParams.get("part"))
  const hit = caches[part]
  if (hit && hit.expires > Date.now()) return jsonResponse(request, hit.body)

  const [camerasResult, camerasTcResult, worksResult, worksTcResult, tollsResult] = await Promise.all([
    loadLayer("DRSS:VW_SNAPSHOT_IMAGE_EN", camerasFromWfs, CAMERA_LAYER_MS),
    loadLayer("DRSS:VW_SNAPSHOT_IMAGE_TC", camerasFromWfs, CAMERA_LAYER_MS),
    loadLayer("DRSS:VW_ROAD_WORK_EN", worksFromWfs, WORKS_LAYER_MS),
    loadLayer("DRSS:VW_ROAD_WORK_TC", worksFromWfs, WORKS_LAYER_MS),
    loadLayer("DRSS:DRSS_TOLL_POINT", tollsFromWfs, TOLL_LAYER_MS),
  ])

  const cameras = withPortalCameras(
    withTraditionalText(camerasResult.features, camerasTcResult.features, ["name", "district", "region"]),
    tollsResult.features,
  )
  const works = fillWorksChinese(
    withTraditionalText(worksResult.features, worksTcResult.features, [
      "road",
      "place",
      "status",
      "kind",
      "lane",
      "bound",
      "district",
    ]),
  )
  const empty = { type: "FeatureCollection" as const, features: [] }
  const errors = [camerasResult.error, worksResult.error, tollsResult.error].filter(
    (error): error is string => Boolean(error),
  )
  const body: PictureResponse = {
    ok: true,
    error: errors.length > 0 ? errors.join(" ") : undefined,
    cameras: part === "works" ? empty : cameras,
    works: part === "cameras" ? empty : works,
    tolls: part === "works" ? empty : tollsResult.features,
  }
  if (part === "all") {
    const count = cameras.features.length + works.features.length + tollsResult.features.features.length
    body.ok = count > 0 || errors.length === 0
  } else if (part === "cameras") {
    body.ok = cameras.features.length > 0 || !camerasResult.error
  } else {
    body.ok = works.features.length > 0 || !worksResult.error
  }
  const ttl = part === "works" ? WORKS_LAYER_MS : part === "cameras" ? CAMERA_LAYER_MS : PICTURE_POLL_MS
  caches = { ...caches, [part]: { expires: Date.now() + (body.ok ? ttl : 10_000), body } }
  return jsonResponse(request, body, body.ok ? 200 : 502)
}

function picturePart(value: string | null): PicturePart {
  switch (value) {
    case "cameras":
    case "works":
    case "all":
      return value
    case null:
      return "all"
    default:
      return "all"
  }
}

async function loadLayer(
  typeName: string,
  read: (wfs: unknown) => GeoJSON.FeatureCollection,
  ttlMs: number,
): Promise<{ features: GeoJSON.FeatureCollection; error?: string }> {
  const hit = layers.get(typeName)
  if (hit && hit.expires > Date.now()) return { features: hit.features }
  try {
    const wfs = await readJson(wfsUrl(typeName), ttlMs)
    const features = read(wfs)
    layers.set(typeName, { expires: Date.now() + ttlMs, features })
    return { features }
  } catch (error) {
    if (hit) return { features: hit.features }
    return {
      features: { type: "FeatureCollection", features: [] },
      error: error instanceof Error ? error.message : `${typeName} failed`,
    }
  }
}

function wfsUrl(typeName: string): string {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
  })
  return `https://www.hkemobility.gov.hk/api/drss/layer/map?${params}`
}

async function readJson(url: string, ttlMs: number): Promise<unknown> {
  const response = await fetchUpstream(url, ttlMs, {
    timeoutMs: 40_000,
    headers: {
      Accept: "application/json",
      Referer: REFERER,
    },
  })
  if (response.status !== 200) throw new Error(`HTTP ${response.status} from hkemobility.gov.hk`)
  return JSON.parse(new TextDecoder().decode(response.body)) as unknown
}
