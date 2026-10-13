import { cachedValue } from "./board-cache.ts"
import { mergeSamePoles } from "./kmb-pole.ts"
import { ETA_FRESH_MS } from "./place-arrivals.ts"
import { ETA_QUEUE_LIMIT } from "./polite-fetch.ts"
import { pool } from "./pool.ts"
import type { ArrivalClock } from "./types.ts"

type Pole = {
  tc: string
  en: string
  lng: number
  lat: number
  routes: string[]
}

type Call = {
  route: string
  destTc: string
  destEn: string
  minutes: number | null
}

export type PoleBoard<C> = {
  id: string
  nameTc: string
  nameEn: string
  lng: number
  lat: number
  routes: string[]
  calls: C[]
  clock: ArrivalClock
}

type Read<Job, Row, CallT extends Call> = {
  poleIds: () => string[]
  pole: (id: string) => Pole | null
  jobs: (id: string, pole: Pole) => readonly Job[]
  rows: (id: string, job: Job) => Promise<Row[] | null>
  calls: (id: string, job: Job, rows: Row[], now: number) => CallT[]
}

export function loadPoleBoard<Job, Row, CallT extends Call>(
  cacheKey: string,
  now: number,
  read: Read<Job, Row, CallT>,
): Promise<{ ok: true; stop: PoleBoard<CallT> } | { ok: false }> {
  return cachedValue(cacheKey, ETA_FRESH_MS, () => collectPoleBoard(now, read))
}

async function collectPoleBoard<Job, Row, CallT extends Call>(
  now: number,
  read: Read<Job, Row, CallT>,
): Promise<{ ok: true; stop: PoleBoard<CallT> } | { ok: false }> {
  const ids = read.poleIds()
  if (ids.length === 0) return { ok: false }
  const stops: PoleBoard<CallT>[] = []
  let missed = 0
  for (const id of ids) {
    const pole = read.pole(id)
    if (!pole) {
      missed += 1
      continue
    }
    const calls: CallT[] = []
    await pool(read.jobs(id, pole), ETA_QUEUE_LIMIT, async (job) => {
      const rows = await read.rows(id, job)
      if (!rows) {
        missed += 1
        return
      }
      calls.push(...read.calls(id, job, rows, now))
    })
    stops.push({
      id,
      nameTc: pole.tc,
      nameEn: pole.en,
      lng: pole.lng,
      lat: pole.lat,
      routes: pole.routes,
      calls,
      clock: "ready",
    })
  }
  const shown = mergeSamePoles(stops)[0]
  if (!shown?.calls) return { ok: false }
  if (missed > 0 && shown.calls.length === 0) return { ok: false }
  return { ok: true, stop: { ...shown, calls: shown.calls, clock: shown.clock ?? "ready" } }
}
