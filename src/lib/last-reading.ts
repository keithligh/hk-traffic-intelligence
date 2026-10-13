export function nextReading<T extends { ok: boolean; listReady?: boolean }>(current: T | null, incoming: T): T {
  if (incoming.ok && incoming.listReady === false && current?.ok && current.listReady !== false) return current
  if (incoming.ok) return incoming
  if (current?.ok) return current
  return incoming
}

// A slow list for the same view must not wipe a list that already arrived.
// A moved map takes the new view's stops even while that list is still being read.
export function readingForView<T extends { ok: boolean; listReady?: boolean }>(
  current: T | null,
  incoming: T,
  sameView: boolean,
): T {
  if (sameView) return nextReading(current, incoming)
  if (incoming.ok) return incoming
  return nextReading(current, incoming)
}

export function scheduleLiveRead(running: boolean, latest: string | null): "wait" | "fetch" | "stop" {
  if (!latest) return "stop"
  if (running) return "wait"
  return "fetch"
}

export function continueLiveRead(fetched: string | null, latest: string | null): boolean {
  return fetched !== latest
}
