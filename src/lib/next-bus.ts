export type NextBusRow = {
  eta?: string | null
  remarkTc?: string
  remarkEn?: string
  scheduled?: boolean
}

export type NextBus = {
  index: number
  eta: string
  minutes: number | null
  scheduled: boolean
  remarkTc: string
  remarkEn: string
}

// The next bus is the soonest clock that has not passed. A passed clock is not a time to wait for.
export function nextBus(rows: readonly NextBusRow[], now: number): NextBus {
  let index = -1
  let bestMs = Number.POSITIVE_INFINITY
  let remarkTc = ""
  let remarkEn = ""
  rows.forEach((row, i) => {
    const tc = (row.remarkTc ?? "").trim()
    const en = (row.remarkEn ?? "").trim()
    if (!remarkTc && !remarkEn && (tc || en)) {
      remarkTc = tc
      remarkEn = en
    }
    const etaMs = row.eta ? Date.parse(row.eta) : Number.NaN
    if (!Number.isFinite(etaMs) || etaMs < now || etaMs >= bestMs) return
    index = i
    bestMs = etaMs
  })
  if (index < 0) return { index, eta: "", minutes: null, scheduled: false, remarkTc, remarkEn }
  const chosen = rows[index]
  const scheduled = chosen?.scheduled === true
  return {
    index,
    eta: new Date(bestMs).toISOString(),
    minutes: Math.max(0, Math.round((bestMs - now) / 60_000)),
    scheduled,
    remarkTc: scheduled ? "" : (chosen?.remarkTc ?? "").trim(),
    remarkEn: scheduled ? "" : (chosen?.remarkEn ?? "").trim(),
  }
}
