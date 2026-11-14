import { arrivalWhen } from "./arrival-when.ts"
import type { Messages } from "./i18n.ts"

// The time column is only a short clock. A service note goes on the line under the
// place name. A long note in the clock column squeezes that name down to one character.
export function arrivalClock(minutes: number | null, eta: string, m: Messages): string {
  if (minutes != null) {
    const label = arrivalWhen(minutes, eta, Date.now())
    if (label === "count") return m.minutes(minutes)
    if (label === "arriving") return m.mtrArriving
  }
  return m.kmbNone
}

export function kmbArrivalLine(minutes: number | null, eta: string, remark: string, scheduled: boolean, m: Messages): { when: string; note: string } {
  return { when: arrivalClock(minutes, eta, m), note: [scheduled ? m.kmbScheduled : "", remark].filter(Boolean).join(" ") }
}

export function ferryArrivalLine(
  minutes: number | null,
  eta: string,
  remark: string,
  service: string,
  serviceAside: string,
  scheduled: boolean,
  m: Messages,
): { when: string; note: string } {
  const when = arrivalClock(minutes, eta, m)
  if (scheduled) return { when, note: remark || service }
  if (remark && minutes != null) return { when, note: remark }
  if (remark) return { when, note: [serviceAside, remark].filter(Boolean).join(" ") }
  return { when, note: serviceAside }
}
