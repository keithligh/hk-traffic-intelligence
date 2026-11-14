import { arrivalWhen } from "./arrival-when.ts"
import type { Messages } from "./i18n.ts"

// The time column stays short. A service note goes on the line under the destination,
// otherwise a long remark squeezes the place name down to one character.
export function kmbArrivalLine(minutes: number | null, eta: string, remark: string, scheduled: boolean, m: Messages): { when: string; note: string } {
  let when = ""
  if (minutes != null) {
    const label = arrivalWhen(minutes, eta, Date.now())
    if (label === "count") when = m.minutes(minutes)
    else if (label === "arriving") when = m.mtrArriving
  }
  return { when: when || m.kmbNone, note: [scheduled ? m.kmbScheduled : "", remark].filter(Boolean).join(" ") }
}
