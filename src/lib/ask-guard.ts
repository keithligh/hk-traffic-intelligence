import type { Locale } from "./i18n.ts"

// Guards for the public question box: a per-visitor rate limit, a cache key so repeated
// questions share one answer, and Jev's check that an answer adds nothing the facts lack.

const CACHE_WINDOW_MS = 5 * 60_000
const JEV_TIMEOUT_MS = 8_000

// Kept in memory, so it holds per Worker isolate: enough to stop one visitor flooding the AI.
export class RateLimit {
  private seen = new Map<string, number[]>()
  private readonly max: number
  private readonly windowMs: number

  constructor(max: number, windowMs: number) {
    this.max = max
    this.windowMs = windowMs
  }

  allow(visitor: string, now = Date.now()): boolean {
    const recent = (this.seen.get(visitor) ?? []).filter((at) => now - at < this.windowMs)
    if (recent.length >= this.max) {
      this.seen.set(visitor, recent)
      return false
    }
    recent.push(now)
    this.seen.set(visitor, recent)
    if (this.seen.size > 10_000) this.seen.clear()
    return true
  }
}

export function questionKey(question: string, locale: Locale, now = Date.now()): string {
  const normal = question.trim().replace(/\s+/g, " ").toLowerCase()
  return `${locale}|${Math.floor(now / CACHE_WINDOW_MS)}|${normal}`
}

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

// Jev answers the same request at TypeSafe (https://docs.typesafe.ai/api.md) and through
// OpenRouter; only the address and the model name differ.
const JEV_ROUTES = {
  typesafe: { url: "https://api.typesafe.ai/v1/systemone", model: "jev-latest" },
  openrouter: { url: "https://openrouter.ai/api/alpha/decisions", model: "~typesafe/jev-latest" },
} as const

// One noul question: does the answer say anything the facts do not support?
export function jevGuard(key: string, fetcher: Fetch = fetch, via: keyof typeof JEV_ROUTES = "typesafe"): (facts: string, answer: string) => Promise<number | null> {
  const route = JEV_ROUTES[via]
  return async (facts, answer) => {
    try {
      const response = await fetcher(route.url, {
        method: "POST",
        signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: route.model,
          state: { facts, answer },
          questions: {
            unsupported: {
              type: "noul",
              instructions:
                "Does `answer` state anything that `facts` does not support, such as a cause, a prediction, a status like an incident being handled or cleared, or a number that is not in `facts`?",
            },
          },
        }),
      })
      if (!response.ok) return null
      const body = (await response.json()) as { answers?: { unsupported?: { noul?: unknown } } }
      const noul = body.answers?.unsupported?.noul
      return typeof noul === "number" ? noul : null
    } catch {
      return null
    }
  }
}
