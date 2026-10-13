"use client"

import { useEffect, useRef, useState } from "react"
import { continueLiveRead, followBody, readingForView, scheduleLiveRead } from "@/lib/last-reading"
import { politeQueue } from "@/lib/polite-fetch"

const arrivalLane = politeQueue(1)

export function useLiveJson<T extends { ok: boolean }>(
  url: string | null,
  intervalMs = 60_000,
  shareArrivalLane = false,
  followMs?: (data: T) => number | null,
): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef(url)
  const shareRef = useRef(shareArrivalLane)
  const followRef = useRef(followMs)
  const held = useRef<{ url: string | null; data: T | null }>({ url: null, data: null })
  const gate = useRef({ running: false, again: false })
  const stopped = useRef(false)
  followRef.current = followMs

  useEffect(() => {
    stopped.current = false
    return () => {
      stopped.current = true
    }
  }, [])

  useEffect(() => {
    urlRef.current = url
    shareRef.current = shareArrivalLane
    if (!url) return
    let alive = true
    let followTimer = 0

    const load = async (keep: boolean) => {
      if (stopped.current) return
      const step = scheduleLiveRead(gate.current.running, urlRef.current)
      switch (step) {
        case "stop":
          return
        case "wait":
          if (keep) gate.current.again = true
          return
        case "fetch":
          break
        default: {
          const exhaustive: never = step
          return exhaustive
        }
      }
      gate.current.running = true
      try {
        do {
          gate.current.again = false
          const target = urlRef.current
          if (!target || stopped.current) break
          const run = shareRef.current ? (task: () => Promise<void>) => arrivalLane(task) : (task: () => Promise<void>) => task()
          await run(async () => {
            if (stopped.current) return
            try {
              const response = await fetch(target, { cache: "no-store" })
              const body: unknown = await response.json()
              if (stopped.current) return
              if (!hasOk(body)) {
                if (urlRef.current === target) setError(`Unexpected response (${response.status})`)
                return
              }
              const incoming = body as T
              const next = readingForView(held.current.data, incoming, held.current.url === target)
              held.current = { url: incoming.ok ? target : held.current.url, data: next }
              setData(next)
              window.clearTimeout(followTimer)
              const delay = followRef.current?.(followBody(next, incoming)) ?? null
              if (delay != null && alive) {
                followTimer = window.setTimeout(() => {
                  if (alive) void load(true)
                }, delay)
              }
              if (incoming.ok || urlRef.current === target) setError(incoming.ok ? null : readingError(incoming, response.status))
            } catch (cause) {
              if (stopped.current || urlRef.current !== target) return
              setError(cause instanceof Error ? cause.message : "Request failed")
            }
          })
          if (continueLiveRead(target, urlRef.current)) gate.current.again = true
        } while (gate.current.again && !stopped.current)
      } finally {
        gate.current.running = false
      }
    }

    void load(false)
    const timer = window.setInterval(() => {
      if (alive) void load(true)
    }, intervalMs)
    return () => {
      alive = false
      window.clearInterval(timer)
      window.clearTimeout(followTimer)
    }
  }, [intervalMs, shareArrivalLane, url])

  if (!url) return { data: null, error: null }
  return { data, error }
}

function readingError(body: { ok: boolean }, status: number): string {
  if ("error" in body && typeof body.error === "string" && body.error) return body.error
  return `Feed failed (${status})`
}

function hasOk(value: unknown): value is { ok: boolean } {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false
  return typeof value.ok === "boolean"
}
