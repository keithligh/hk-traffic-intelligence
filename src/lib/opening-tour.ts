export const OPENING_SETTLE_MS = 700
export const OPENING_GIVE_UP_MS = 8_000

export type OpeningTour = "wait" | "settle" | "now"

export function roadsAreDrawn(corridors: readonly { coordinates: readonly unknown[] }[]): boolean {
  return corridors.some((corridor) => corridor.coordinates.length >= 2)
}

// A replay starts on the usual pause. The first tour waits until the road lines
// exist, then pauses so that draw can finish. A feed that never arrives still
// starts, so the camera is not stuck.
export function openingTour(automatic: boolean, roadsDrawn: boolean, readyForMs: number): OpeningTour {
  if (!automatic) return "now"
  if (roadsDrawn) return "settle"
  if (readyForMs >= OPENING_GIVE_UP_MS) return "now"
  return "wait"
}
