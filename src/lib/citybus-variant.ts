import variantsFile from "../../data/citybus-variants.json" with { type: "json" }
import { MESSAGES } from "./i18n.ts"

export type VariantLabel = { tc: string; en: string; special: boolean }

type VariantFile = { stops: Record<string, Record<string, VariantLabel[]>> }

const variants = (variantsFile as VariantFile).stops

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

export function citybusVariantNote(stopId: string, route: string): { tc: string; en: string } | null {
  const labels = variants[stopId]?.[route] ?? []
  return citybusVariantCopy(labels, MESSAGES["zh-HK"].unnamedSpecial, MESSAGES.en.unnamedSpecial)
}
