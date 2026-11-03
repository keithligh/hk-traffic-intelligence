export const PUSH_GAP_MS = 140

// Desktop stays on every frame so the dots stay smooth. The gap is for iOS,
// where a GeoJSON push on every frame stops the map tiles from loading.
export function motionGap(phone: boolean): number {
  return phone ? PUSH_GAP_MS : 0
}

export type PushGate = {
  busy: boolean
  at: number
}

export function pushDue(gate: PushGate, now: number, gapMs: number): boolean {
  if (gate.busy) return false
  return now - gate.at >= gapMs
}

export function beginPush(gate: PushGate, now: number, gapMs: number): boolean {
  if (gate.busy) return false
  if (now - gate.at < gapMs) return false
  gate.busy = true
  gate.at = now
  return true
}

export function endPush(gate: PushGate): void {
  gate.busy = false
}
