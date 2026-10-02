import type { ApproachPoint, HarbourJourney } from "./types.ts"

const ORDER = ["CH", "EH", "WH"] as const

export type HarbourCode = (typeof ORDER)[number]

export type HarbourOption = {
  code: HarbourCode
  minutes: number
  colour: HarbourJourney["colour"]
  // Minutes slower than the fastest tunnel from the same start.
  delta: number
  fastest: boolean
}

// The three tunnels from one start, fastest first.
export function harbourChoice(point: ApproachPoint): HarbourOption[] {
  const rows = point.legs.flatMap((leg) => {
    const code = ORDER.find((item) => item === leg.code)
    return code && leg.minutes != null ? [{ code, minutes: leg.minutes, colour: leg.colour }] : []
  })
  rows.sort((a, b) => a.minutes - b.minutes || ORDER.indexOf(a.code) - ORDER.indexOf(b.code))
  const best = rows[0]?.minutes ?? 0
  return rows.map((row) => ({ ...row, delta: row.minutes - best, fastest: row.minutes === best }))
}

// The saved start if it is still published, otherwise the start that reaches the most tunnels.
export function pickOrigin(points: ApproachPoint[], saved: string | null): ApproachPoint | null {
  const kept = points.find((point) => point.id === saved)
  if (kept) return kept
  let pick: ApproachPoint | null = null
  for (const point of points) {
    if (!pick || harbourChoice(point).length > harbourChoice(pick).length) pick = point
  }
  return pick
}
