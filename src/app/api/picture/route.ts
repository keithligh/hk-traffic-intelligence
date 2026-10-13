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

let cache: { expires: number; body: PictureResponse } | null = null
const layers = new Map<string, { expires: number; features: GeoJSON.FeatureCollection }>()

export async function GET(request: Request) {
  if (cache && cache.expires > Date.now()) {
    return jsonResponse(request, cache.body)
  }

  const [camerasResult, camerasTcResult, worksResult, worksTcResult, tollsResult] = await Promise.all([
    loadLayer("DRSS:VW_SNAPSHOT_IMAGE_EN", camerasFromWfs, CAMERA_LAYER_MS),
    loadLayer("DRSS:VW_SNAPSHOT_IMAGE_TC", camerasFromWfs, CAMERA_LAYER_MS),
    loadLayer("DRSS:VW_ROAD_WORK_EN", worksFromWfs, WORKS_LAYER_MS),
    loadLayer("DRSS:VW_ROAD_WORK_TC", worksFromWfs, WORKS_LAYER_MS),
    loadLayer("DRSS:DRSS_TOLL_POINT", tollsFromWfs, TOLL_LAYER_MS),
  ])

  const errors = [camerasResult.error, worksResult.error, tollsResult.error].filter(
    (error): error is string => Boolean(error),
  )
  const featureCount =
    camerasResult.features.features.length +
    worksResult.features.features.length +
    tollsResult.features.features.length
  const body: PictureResponse = {
    ok: featureCount > 0 || errors.length === 0,
    error: errors.length > 0 ? errors.join(" ") : undefined,
    cameras: withPortalCameras(
      withTraditionalText(camerasResult.features, camerasTcResult.features, ["name", "district", "region"]),
      tollsResult.features,
    ),
    works: fillWorksChinese(
      withTraditionalText(worksResult.features, worksTcResult.features, [
        "road",
        "place",
        "status",
        "kind",
        "lane",
        "bound",
        "district",
      ]),
    ),
    tolls: tollsResult.features,
  }
  cache = { expires: Date.now() + (body.ok ? PICTURE_POLL_MS : 10_000), body }
  return jsonResponse(request, body, body.ok ? 200 : 502)
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
