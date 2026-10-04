import { aiKeys, askInput, feedLoader, readCityFeeds, workerEnv } from "@/app/api/_city/feeds"
import { askFacts } from "@/lib/ask-facts"
import { jevGuard, questionKey, RateLimit } from "@/lib/ask-guard"
import { answerQuestion, type AskResult } from "@/lib/ask-llm"
import { localeOf } from "@/lib/i18n"

export const dynamic = "force-dynamic"

const MAX_QUESTION = 200
const limit = new RateLimit(5, 10 * 60_000)
const answered = new Map<string, AskBody>()

type AskBody =
  | ({ ok: true; at: string } & Omit<AskResult, "model">)
  | { ok: false; code: "empty" | "too-long" | "rate" | "no-key" | "unreliable" | "failed"; error: string }

// Whether the question box should be shown at all.
export async function GET() {
  const keys = aiKeys(await workerEnv())
  return Response.json({ ok: true, available: Boolean(keys.deepseek || keys.anthropic) }, { headers: { "Cache-Control": "public, max-age=300" } })
}

export async function POST(request: Request) {
  const env = await workerEnv()
  const keys = aiKeys(env)
  if (!keys.deepseek && !keys.anthropic) return json({ ok: false, code: "no-key", error: "No AI provider key is set" })
  let payload: { question?: unknown; locale?: unknown }
  try {
    payload = (await request.json()) as typeof payload
  } catch {
    payload = {}
  }
  const question = typeof payload.question === "string" ? payload.question.trim() : ""
  const locale = localeOf(typeof payload.locale === "string" ? payload.locale : undefined)
  if (!question) return json({ ok: false, code: "empty", error: "Ask a question" }, 400)
  if (question.length > MAX_QUESTION) return json({ ok: false, code: "too-long", error: `At most ${MAX_QUESTION} characters` }, 400)

  const key = questionKey(question, locale)
  const kept = answered.get(key) ?? (await readShared(key))
  if (kept) return json(kept)

  const visitor = request.headers.get("CF-Connecting-IP") ?? "local"
  if (!limit.allow(visitor)) return json({ ok: false, code: "rate", error: "Too many questions; try again in a few minutes" }, 429)

  try {
    const feeds = await readCityFeeds(feedLoader(env, new URL(request.url).origin), true)
    const facts = askFacts(askInput(feeds))
    // Jev checks answers with a TypeSafe key, or an OpenRouter key as AGENTS.md describes.
    const guard = keys.typesafe ? jevGuard(keys.typesafe) : keys.openrouter ? jevGuard(keys.openrouter, fetch, "openrouter") : null
    const result = await answerQuestion(question, facts, locale, keys, undefined, guard)
    const body: AskBody = {
      ok: true,
      at: new Date().toISOString(),
      answerable: result.answerable,
      answer: result.answer,
      basis: result.basis,
      provider: result.provider,
      checked: result.checked,
      caution: result.caution,
      jev: result.jev,
    }
    if (answered.size > 500) answered.clear()
    answered.set(key, body)
    await writeShared(key, body)
    return json(body)
  } catch (error) {
    // The reasons name providers and checks, not keys, so they are safe to return.
    const reason = error instanceof Error ? error.message : "Answer failed"
    // Every answer written was rejected by Jev: the visitor is told to read the map instead.
    const unreliable = reason.split("; ").every((part) => part.includes("Jev found an unsupported claim"))
    return json({ ok: false, code: unreliable ? "unreliable" : "failed", error: reason }, unreliable ? 200 : 502)
  }
}

function shareKey(key: string): Request {
  return new Request(`https://ask.internal/v1/${encodeURIComponent(key)}`)
}

async function sharedCache(): Promise<Cache | null> {
  const storage = globalThis.caches as (CacheStorage & { default?: Cache }) | undefined
  return storage?.default ?? null
}

async function readShared(key: string): Promise<AskBody | null> {
  try {
    const hit = await (await sharedCache())?.match(shareKey(key))
    return hit ? ((await hit.json()) as AskBody) : null
  } catch {
    return null
  }
}

async function writeShared(key: string, body: AskBody): Promise<void> {
  try {
    await (await sharedCache())?.put(shareKey(key), Response.json(body, { headers: { "Cache-Control": "public, max-age=300" } }))
  } catch {
    // Still answered; a repeat question is just asked again.
  }
}

function json(body: AskBody, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}
