import { aiKeys, briefingInput, feedLoader, readCityFeeds, workerEnv } from "@/app/api/_city/feeds"
import { briefingFacts } from "@/lib/briefing-facts"
import { writeBriefing, type Briefing, type Provider } from "@/lib/briefing-llm"

export const dynamic = "force-dynamic"

// One briefing per quarter hour, shared by every visitor, so AI calls stay at most 96 a day.
const WINDOW_MS = 15 * 60_000

type BriefingResponse =
  | { ok: true; at: string; provider: Provider; model: string; text: Briefing }
  | { ok: false; error: string }

const memory = new Map<number, BriefingResponse>()

export async function GET(request: Request) {
  const env = await workerEnv()
  const keys = aiKeys(env)
  // Not configured is a normal state for a deployment without AI, so it is not an HTTP error.
  if (!keys.deepseek && !keys.anthropic) return json({ ok: false, error: "No AI provider key is set" }, 200, "public, max-age=300")
  const window = Math.floor(Date.now() / WINDOW_MS)
  const kept = memory.get(window) ?? (await readShared(window))
  if (kept) return json(kept)
  try {
    const feeds = await readCityFeeds(feedLoader(env, new URL(request.url).origin), false)
    const facts = briefingFacts(briefingInput(feeds))
    const written = await writeBriefing(facts, keys)
    const body: BriefingResponse = { ok: true, at: new Date().toISOString(), ...written }
    memory.clear()
    memory.set(window, body)
    await writeShared(window, body)
    return json(body)
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Briefing failed" }, 502)
  }
}

function shareKey(window: number): Request {
  return new Request(`https://briefing.internal/v1/${window}`)
}

async function sharedCache(): Promise<Cache | null> {
  const storage = globalThis.caches as (CacheStorage & { default?: Cache }) | undefined
  return storage?.default ?? null
}

async function readShared(window: number): Promise<BriefingResponse | null> {
  try {
    const hit = await (await sharedCache())?.match(shareKey(window))
    if (!hit) return null
    const body = (await hit.json()) as BriefingResponse
    memory.set(window, body)
    return body
  } catch {
    return null
  }
}

async function writeShared(window: number, body: BriefingResponse): Promise<void> {
  try {
    const seconds = Math.ceil(((window + 1) * WINDOW_MS - Date.now()) / 1000)
    await (await sharedCache())?.put(shareKey(window), Response.json(body, { headers: { "Cache-Control": `public, max-age=${Math.max(1, seconds)}` } }))
  } catch {
    // The briefing is still served; the next isolate writes its own.
  }
}

function json(body: BriefingResponse, status = 200, cache = status === 200 ? "public, max-age=60" : "no-store") {
  return Response.json(body, { status, headers: { "Cache-Control": cache } })
}
