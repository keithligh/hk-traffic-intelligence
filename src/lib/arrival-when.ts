// Zero minutes is two clocks. A clock still ahead is arriving. A clock already past is that time.
export function arrivalWhen(minutes: number, eta: string, now: number): "count" | "arriving" | "clock" {
  if (minutes > 0) return "count"
  const etaMs = Date.parse(eta)
  if (Number.isFinite(etaMs) && etaMs < now) return "clock"
  return "arriving"
}
