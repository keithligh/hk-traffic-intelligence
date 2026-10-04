"use client"

import { useState, useSyncExternalStore } from "react"
import { AskBox } from "@/components/ask-box"
import { useI18n } from "@/components/locale"
import { useLiveJson } from "@/components/use-live-json"
import type { Briefing, Provider } from "@/lib/briefing-llm"
import type { Locale } from "@/lib/i18n"

type BriefingResponse = { ok: true; at: string; provider: Provider; text: Briefing } | { ok: false; error: string }

// Kept here rather than in i18n.ts, which changes often upstream.
const LABEL: Record<Locale, { title: string; hide: string; note: string }> = {
  "zh-HK": { title: "AI 簡報", hide: "收起", note: "AI 生成，以實時數字為準" },
  "zh-CN": { title: "AI 简报", hide: "收起", note: "AI 生成，以实时数字为准" },
  en: { title: "AI briefing", hide: "Hide", note: "Written by AI; the live figures take precedence" },
}

const PROVIDER: Record<Provider, string> = { deepseek: "DeepSeek", anthropic: "Claude" }

const WIDE = "(min-width: 640px)"

function isWide(): boolean {
  return window.matchMedia(WIDE).matches
}

function onWidthChange(notify: () => void): () => void {
  const query = window.matchMedia(WIDE)
  query.addEventListener("change", notify)
  return () => query.removeEventListener("change", notify)
}

export function BriefingCard() {
  const { locale } = useI18n()
  const { data } = useLiveJson<BriefingResponse>("/api/briefing", 5 * 60_000)
  // Open on wide screens and a single button on phones, until the visitor chooses.
  const wide = useSyncExternalStore(onWidthChange, isWide, () => false)
  const [choice, setOpen] = useState<boolean | null>(null)
  const open = choice ?? wide
  if (!data?.ok) return null
  const label = LABEL[locale]
  const time = new Date(data.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Hong_Kong" })
  return (
    <section
      aria-label={label.title}
      // Above the intel panel and layer dock (z-10) while open, below the start picker (z-50): the visitor is using it, and Hide closes it.
      className={`pointer-events-auto absolute top-[var(--map-control-top,4.75rem)] right-2 w-[min(20rem,calc(100%-1rem))] sm:right-3 lg:right-4 ${open ? "z-20" : "z-[5]"}`}
    >
      {open ? (
        <div className="max-h-[min(70dvh,34rem)] overflow-y-auto border border-cyan-200/30 bg-[#041018]/95 p-2 shadow-[0_0_24px_rgba(34,211,238,0.08)] backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            <p className="font-[family-name:var(--font-hud)] text-[0.62rem] tracking-[0.18em] text-cyan-200/80 uppercase">
              {label.title} · {time}
            </p>
            <button
              type="button"
              aria-expanded
              onClick={() => setOpen(false)}
              className="border border-white/15 px-1.5 py-0.5 font-[family-name:var(--font-hud)] text-[0.65rem] text-cyan-50"
            >
              {label.hide}
            </button>
          </div>
          <p className="mt-1.5 text-sm leading-snug text-white">{data.text[locale]}</p>
          <p className="mt-1.5 text-right font-[family-name:var(--font-hud)] text-[0.58rem] text-zinc-400">
            {label.note} · {PROVIDER[data.provider]}
          </p>
          <AskBox />
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className="ml-auto block border border-cyan-200/30 bg-[#041018]/88 px-2 py-1 font-[family-name:var(--font-hud)] text-[0.65rem] tracking-[0.12em] text-cyan-50 uppercase backdrop-blur-md"
        >
          {label.title}
        </button>
      )}
    </section>
  )
}
