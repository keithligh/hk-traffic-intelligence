import type { PictureResponse } from "@/lib/types"

const empty = { type: "FeatureCollection" as const, features: [] }

export function mergePicture(cameras: PictureResponse | null, works: PictureResponse | null): PictureResponse | null {
  if (!cameras && !works) return null
  const error = [cameras?.error, works?.error].filter((item): item is string => Boolean(item)).join(" ")
  return {
    ok: Boolean(cameras?.ok || works?.ok),
    error: error.length > 0 ? error : undefined,
    cameras: cameras?.cameras ?? empty,
    works: works?.works ?? empty,
    tolls: cameras?.tolls ?? empty,
  }
}
