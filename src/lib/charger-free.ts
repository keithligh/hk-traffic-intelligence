export function shownChargerFree(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value)
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return null
}
