// A count is a bus that is still coming. Zero while the clock is ahead means it is due. A passed clock is not a waiting time.
export function arrivalWhen(minutes: number, eta: string, now: number): "count" | "arriving" | "gone" {
  if (minutes > 0) return "count"
  const etaMs = Date.parse(eta)
  if (Number.isFinite(etaMs) && etaMs < now) return "gone"
  return "arriving"
}
