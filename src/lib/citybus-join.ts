type StopFix = { tc: string; en: string; lng: number; lat: number }
type StopRecord = StopFix & { routes: string[] }

// Routes come from the route walk. Coordinates come from the saved stop, or from a stop document when the stop is new.
// The set is not ready while a new stop still has no coordinates.
export function citybusRecords(
  members: ReadonlyMap<string, readonly string[]>,
  bundled: Record<string, StopRecord>,
  details: Record<string, StopFix>,
  minimum: number,
): Record<string, StopRecord> | null {
  if (members.size < minimum) return null
  const next: Record<string, StopRecord> = {}
  for (const [id, routes] of members) {
    const detail = details[id]
    const known = bundled[id]
    const source = detail ?? known
    if (!source || !Number.isFinite(source.lng) || !Number.isFinite(source.lat)) return null
    next[id] = {
      tc: source.tc,
      en: source.en,
      lng: source.lng,
      lat: source.lat,
      routes: [...routes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    }
  }
  if (Object.keys(next).length < minimum) return null
  return next
}
