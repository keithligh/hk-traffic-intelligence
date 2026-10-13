import type { Corridor, TrafficResponse, TrafficSpeedReading } from "@/lib/types"

export function speedReading(body: TrafficResponse): TrafficSpeedReading {
  return {
    shape: "speeds",
    ok: body.ok,
    error: body.error,
    observedAt: body.observedAt,
    summary: body.summary,
    segments: body.segments,
    network: body.network,
    speeds: body.corridors.map((corridor) => ({
      id: corridor.id,
      speedKmh: corridor.speedKmh,
      band: corridor.band,
    })),
  }
}

export function isSpeedReading(body: { ok: boolean; shape?: string }): body is TrafficSpeedReading {
  return body.shape === "speeds"
}

export function applySpeeds(held: TrafficResponse, patch: TrafficSpeedReading): TrafficResponse | null {
  if (held.network.revisionDate !== patch.network.revisionDate) return null
  if (held.network.usedOnMap !== patch.network.usedOnMap) return null
  const byId = new Map(held.corridors.map((corridor) => [corridor.id, corridor]))
  const corridors: Corridor[] = []
  for (const speed of patch.speeds) {
    const corridor = byId.get(speed.id)
    if (!corridor) return null
    corridors.push({ ...corridor, speedKmh: speed.speedKmh, band: speed.band })
  }
  return {
    ...held,
    ok: patch.ok,
    error: patch.error,
    observedAt: patch.observedAt,
    summary: patch.summary,
    segments: patch.segments,
    network: patch.network,
    corridors,
  }
}

export function nextRoads(
  current: TrafficResponse | null,
  incoming: TrafficResponse | TrafficSpeedReading,
): { roads: TrafficResponse | null; shape: "full" | "speeds" } {
  if (!isSpeedReading(incoming)) {
    const shape = incoming.ok && incoming.corridors.some((corridor) => corridor.coordinates.length > 0) ? "speeds" : "full"
    return { roads: incoming, shape }
  }
  if (!current?.ok) return { roads: current, shape: "full" }
  const joined = applySpeeds(current, incoming)
  if (!joined) return { roads: current, shape: "full" }
  return { roads: joined, shape: "speeds" }
}
