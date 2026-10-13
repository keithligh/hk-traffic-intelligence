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

export function kmbListFollowMs(body: { ok: boolean; listReady?: boolean }): number | null {
  if (!body.ok || body.listReady !== false) return null
  return KMB_LIST_FOLLOW_MS
}
