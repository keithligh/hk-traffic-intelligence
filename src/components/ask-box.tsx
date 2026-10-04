"use client"

import { useState, type FormEvent } from "react"
import { useI18n } from "@/components/locale"
import type { Locale } from "@/lib/i18n"

type AskReply =
  | { ok: true; answerable: boolean; answer: string; basis: string[]; provider: "deepseek" | "anthropic"; checked: boolean; caution: boolean }
  | { ok: false; code: string; error: string }

// Kept here rather than in i18n.ts, which changes often upstream.
const LABEL: Record<Locale, Record<"ask" | "placeholder" | "send" | "thinking" | "basis" | "checked" | "caution" | "rate" | "unreliable" | "failed" | "tooLong", string>> = {
  "zh-HK": {
    ask: "問 AI",
    placeholder: "例如：我在銅鑼灣，過海走哪條隧道最快？",
    send: "問",
    thinking: "查看即時數據中…",
    basis: "根據",
    checked: "已經 Jev 核對",
    caution: "AI 核對時有保留，請以地圖上的數字為準。",
    rate: "提問太密，請過幾分鐘再試。",
    unreliable: "未能可靠回答這條問題，請直接看地圖上的資料。",
    failed: "暫時未能回答，請稍後再試。",
    tooLong: "問題最多 200 字。",
  },
  "zh-CN": {
    ask: "问 AI",
    placeholder: "例如：我在铜锣湾，过海走哪条隧道最快？",
    send: "问",
    thinking: "查看实时数据中…",
    basis: "依据",
    checked: "已经 Jev 核对",
    caution: "AI 核对时有保留，请以地图上的数字为准。",
    rate: "提问太密，请过几分钟再试。",
    unreliable: "未能可靠回答这条问题，请直接看地图上的资料。",
    failed: "暂时未能回答，请稍后再试。",
    tooLong: "问题最多 200 字。",
  },
  en: {
    ask: "Ask AI",
    placeholder: "e.g. I'm in Causeway Bay. Which tunnel is fastest?",
    send: "Ask",
    thinking: "Reading the live data…",
    basis: "Based on",
    checked: "Checked by Jev",
    caution: "The AI check was unsure; go by the figures on the map.",
    rate: "Too many questions; try again in a few minutes.",
    unreliable: "This could not be answered reliably; please read the map.",
    failed: "Could not answer just now; try again shortly.",
    tooLong: "At most 200 characters.",
  },
}

const MAX_QUESTION = 200

export function AskBox() {
  const { locale } = useI18n()
  const label = LABEL[locale]
  const [question, setQuestion] = useState("")
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState<AskReply | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = question.trim()
    if (!text || busy) return
    setBusy(true)
    setReply(null)
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, locale }),
      })
      setReply((await response.json()) as AskReply)
    } catch {
      setReply({ ok: false, code: "failed", error: "network" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <form onSubmit={submit} className="flex gap-1.5">
        <label className="sr-only" htmlFor="ask-ai">
          {label.ask}
        </label>
        <input
          id="ask-ai"
          type="text"
          value={question}
          maxLength={MAX_QUESTION}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={label.placeholder}
          className="min-w-0 flex-1 border border-white/15 bg-black/40 px-1.5 py-1 text-sm text-white placeholder:text-zinc-500"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="shrink-0 border border-cyan-200/40 px-2 py-1 font-[family-name:var(--font-hud)] text-[0.7rem] tracking-[0.08em] text-cyan-50 disabled:opacity-40"
        >
          {label.send}
        </button>
      </form>
      <div aria-live="polite">
        {busy ? <p className="mt-1.5 text-xs text-zinc-400">{label.thinking}</p> : null}
        {reply ? <Reply reply={reply} label={label} /> : null}
      </div>
    </div>
  )
}

function Reply(props: { reply: AskReply; label: (typeof LABEL)[Locale] }) {
  const { reply, label } = props
  if (!reply.ok) {
    const text = reply.code === "rate" ? label.rate : reply.code === "unreliable" ? label.unreliable : reply.code === "too-long" ? label.tooLong : label.failed
    return <p className="mt-1.5 text-xs text-amber-200">{text}</p>
  }
  return (
    <div className="mt-1.5">
      <p className="text-sm leading-snug text-white">{reply.answer}</p>
      {reply.caution ? <p className="mt-1 text-xs text-amber-200">{label.caution}</p> : null}
      {reply.basis.length > 0 ? (
        <details className="mt-1 text-xs text-zinc-400">
          <summary className="cursor-pointer">
            {label.basis}
            {reply.checked ? ` · ${label.checked}` : ""}
          </summary>
          <ul className="mt-1 list-disc pl-4">
            {reply.basis.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
