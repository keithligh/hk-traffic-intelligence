import { CLAUDE_MODEL, claudeJson, DEEPSEEK_MODEL, deepseekJson } from "./llm-json.ts"

// Writes the AI city briefing. DeepSeek is tried first; Claude is the fallback.

export type Briefing = { "zh-HK": string; "zh-CN": string; en: string }
export type BriefingKeys = { deepseek?: string; anthropic?: string }
export type Provider = keyof Writers
export type Writers = {
  deepseek: (key: string, system: string, facts: string) => Promise<string>
  anthropic: (key: string, system: string, facts: string) => Promise<string>
}

const MAX_CHARS = 400

export const MODELS: Record<Provider, string> = { deepseek: DEEPSEEK_MODEL, anthropic: CLAUDE_MODEL }

const SYSTEM = `You write a short live traffic briefing for a Hong Kong traffic map.
Use only the facts you are given. Add nothing they do not state: no causes, no predictions, no advice, and no status such as an incident being handled or cleared.
Lead with what matters most to someone about to travel now: incidents and warnings in force, then the fastest harbour crossing, then the worst congested roads.
Mention only the topics listed. If incidents or warnings are not listed, do not mention them at all.
At most three short sentences per language; keep the Chinese under 90 characters and the English under 250 characters.
Return json with exactly three keys:
- "zhHK": Traditional Chinese in Hong Kong written style (書面語, not spoken Cantonese: 是 not 係, 的 not 嘅, 現時 not 而家). Use Hong Kong names: 紅隧, 東隧, 西隧, 巴士, 港鐵. Never use Simplified characters.
- "zhCN": Simplified Chinese.
- "en": English.
Example: {"zhHK": "...", "zhCN": "...", "en": "..."}`

const SCHEMA = {
  type: "object",
  properties: { zhHK: { type: "string" }, zhCN: { type: "string" }, en: { type: "string" } },
  required: ["zhHK", "zhCN", "en"],
  additionalProperties: false,
}

export async function writeBriefing(
  facts: string,
  keys: BriefingKeys,
  writers: Writers = DEFAULT_WRITERS,
): Promise<{ text: Briefing; provider: Provider; model: string }> {
  const order: Provider[] = ["deepseek", "anthropic"]
  const failures: string[] = []
  for (const provider of order) {
    const key = keys[provider]
    if (!key) continue
    try {
      const raw = await writers[provider](key, SYSTEM, facts)
      const text = parseBriefing(raw)
      if (text) return { text, provider, model: MODELS[provider] }
      failures.push(`${provider}: ${briefingProblem(raw)}`)
    } catch (error) {
      failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(failures.length > 0 ? failures.join("; ") : "no AI provider key is set")
}

export function parseBriefing(raw: string): Briefing | null {
  const read = readBriefing(raw)
  return typeof read === "string" ? null : read
}

// Why an answer was rejected, or null when it is usable.
export function briefingProblem(raw: string): string | null {
  const read = readBriefing(raw)
  return typeof read === "string" ? read : null
}

function readBriefing(raw: string): Briefing | string {
  const json = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  if (!json) return "empty answer"
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return "not JSON"
  }
  if (!value || typeof value !== "object") return "not a JSON object"
  const fields = value as Record<string, unknown>
  const texts: string[] = []
  for (const key of ["zhHK", "zhCN", "en"]) {
    const text = typeof fields[key] === "string" ? fields[key].trim() : ""
    if (!text) return `${key} empty`
    if (text.length > MAX_CHARS) return `${key} too long (${text.length})`
    texts.push(text)
  }
  const [hk, cn, english] = texts as [string, string, string]
  return { "zh-HK": hk, "zh-CN": cn, en: english }
}

const DEFAULT_WRITERS: Writers = {
  deepseek: (key, system, facts) => deepseekJson(key, system, facts),
  anthropic: (key, system, facts) => claudeJson(key, system, facts, SCHEMA),
}
