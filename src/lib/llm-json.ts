import Anthropic from "@anthropic-ai/sdk"

// JSON answers from the two providers the AI features use. Each returns the raw text;
// callers validate it, since a model can still return malformed or unsupported content.

export const DEEPSEEK_MODEL = "deepseek-flash"
// Haiku: the fallback restates given facts, so the cheapest current model is enough.
export const CLAUDE_MODEL = "claude-haiku-4-5"

// DeepSeek has no TypeScript SDK; its chat API is plain JSON over HTTPS.
export async function deepseekJson(key: string, system: string, user: string, maxTokens = 1000): Promise<string> {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Restating given facts needs no reasoning pass.
      thinking: { type: "disabled" },
      temperature: 0.3,
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
      stream: false,
    }),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = (await response.json()) as { choices?: { message?: { content?: string | null } }[] }
  return body.choices?.[0]?.message?.content ?? ""
}

export async function claudeJson(key: string, system: string, user: string, schema: Record<string, unknown>): Promise<string> {
  const client = new Anthropic({ apiKey: key, timeout: 30_000, maxRetries: 1 })
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: user }],
    // Haiku 4.5 takes no effort setting; the schema keeps the answer to the expected fields.
    output_config: { format: { type: "json_schema", schema } },
  })
  if (response.stop_reason === "refusal") throw new Error("refused")
  return response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("")
}
