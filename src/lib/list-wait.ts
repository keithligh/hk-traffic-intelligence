// A KMB pole missing from the saved list waits this long for the daily stop list.
// The map draws the saved stops at once and does not wait.
export const KMB_LIST_BUDGET_MS = 8_000
export const KMB_LIST_FOLLOW_MS = 2_000

export function settleWithin<T>(work: Promise<T>, budgetMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: T) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(fallback), budgetMs)
    work.then(
      (value) => finish(value),
      () => finish(fallback),
    )
  })
}

export function withinBudget(work: Promise<unknown>, budgetMs: number): Promise<boolean> {
  if (!(budgetMs > 0)) return Promise.resolve(false)
  return new Promise((resolve) => {
    let settled = false
    const finish = (ready: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ready)
    }
    const timer = setTimeout(() => finish(false), budgetMs)
    work.then(() => finish(true), () => finish(false))
  })
}

export function cycleStatus(
  now: number,
  nextTryAt: number,
  published: boolean,
  replaced: boolean,
): { listReady: boolean; refreshing: boolean } {
  if (now < nextTryAt) return { listReady: true, refreshing: false }
  return { listReady: published || replaced, refreshing: published && !replaced }
}

export function kmbListFollowMs(body: { ok: boolean; listReady?: boolean; refreshing?: boolean }): number | null {
  if (!body.ok) return null
  if (body.refreshing === true || body.listReady === false) return KMB_LIST_FOLLOW_MS
  return null
}
