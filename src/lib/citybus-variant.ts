import { MESSAGES } from "./i18n.ts"

export type VariantLabel = { tc: string; en: string; special: boolean }

type VariantFile = { stops: Record<string, Record<string, VariantLabel[]>> }

let variants: VariantFile["stops"] | null = null
let loading: Promise<VariantFile["stops"]> | null = null

// The specials file is about a megabyte. Load it on the first Citybus card, not when the worker boots.
export function loadCitybusVariants(): Promise<VariantFile["stops"]> {
  if (variants) return Promise.resolve(variants)
  if (!loading) {
    loading = import("../../data/citybus-variants.json", { with: { type: "json" } }).then((mod) => {
      const file = mod.default as VariantFile
      variants = file.stops ?? {}
      return variants
    }).catch(() => {
      loading = null
      return {}
    })
  }
  return loading
}

export function citybusVariantCopy(labels: readonly VariantLabel[], unnamedTc: string, unnamedEn: string): { tc: string; en: string } | null {
  if (labels.length === 0) return null
  const specials = labels.filter((item) => item.special)
  if (labels.length === 1) {
    const only = specials[0]
    if (!only) return null
    return { tc: only.tc, en: only.en }
  }
  const shown = specials.length > 0 ? specials : labels
  return {
    tc: [unnamedTc, ...shown.map((item) => item.tc)].filter(Boolean).join("，"),
    en: [unnamedEn, ...shown.map((item) => item.en)].filter(Boolean).join(", "),
  }
}

export async function citybusVariantNote(stopId: string, route: string): Promise<{ tc: string; en: string } | null> {
  const table = await loadCitybusVariants()
  const labels = table[stopId]?.[route] ?? []
  return citybusVariantCopy(labels, MESSAGES["zh-HK"].unnamedSpecial, MESSAGES.en.unnamedSpecial)
}
