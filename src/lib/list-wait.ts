// A healthy KMB stop-list read finished in about 3 seconds. The map waits this long
// for that read, then draws the stops already loaded. The read keeps going.
export const KMB_LIST_BUDGET_MS = 8_000
export const KMB_LIST_FOLLOW_MS = 2_000

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
