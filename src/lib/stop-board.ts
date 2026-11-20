import { cachedValue } from "@/lib/board-cache"
import { loadCitybusBoard } from "@/lib/citybus-feed"
import { loadGmbBoard } from "@/lib/gmb-feed"
import { withJointCitybus, withJointKmb } from "@/lib/joint-board"
import { loadKmbBoard } from "@/lib/kmb-feed"
import { settleWithin } from "@/lib/list-wait"
import { loadMtrBusBoard } from "@/lib/mtr-bus-feed"
import { loadNlbBoard } from "@/lib/nlb-feed"
import { ETA_FRESH_MS } from "@/lib/place-arrivals"
import type { CitybusStopBoard, KmbStopBoard } from "@/lib/types"

export const STOP_OPERATORS = ["kmb", "citybus", "gmb", "nlb", "mtrbus"] as const

export type StopOperator = (typeof STOP_OPERATORS)[number]

export type StopBoard = KmbStopBoard | CitybusStopBoard

export function isStopOperator(value: string | null): value is StopOperator {
  return value === "kmb" || value === "citybus" || value === "gmb" || value === "nlb" || value === "mtrbus"
}

const JOINT_WAIT_MS = 1_000

export async function loadStopBoard(op: StopOperator, id: string): Promise<{ ok: true; stop: StopBoard } | { ok: false }> {
  switch (op) {
    case "kmb":
      return cachedValue(`joined:kmb:${id}`, ETA_FRESH_MS, () => joinedKmb(id))
    case "citybus":
      return cachedValue(`joined:citybus:${id}`, ETA_FRESH_MS, () => joinedCitybus(id))
    case "gmb":
      return loadGmbBoard(id)
    case "nlb":
      return loadNlbBoard(id)
    case "mtrbus":
      return loadMtrBusBoard(id)
    default: {
      const exhaustive: never = op
      return exhaustive
    }
  }
}

async function joinedKmb(id: string): Promise<{ ok: true; stop: KmbStopBoard } | { ok: false }> {
  const board = await loadKmbBoard(id)
  if (!board.ok) return board
  const stop = await settleWithin(withJointKmb(board.stop), JOINT_WAIT_MS, board.stop)
  return { ok: true, stop }
}

async function joinedCitybus(id: string): Promise<{ ok: true; stop: CitybusStopBoard } | { ok: false }> {
  const board = await loadCitybusBoard(id)
  if (!board.ok) return board
  const stop = await settleWithin(withJointCitybus(board.stop), JOINT_WAIT_MS, board.stop)
  return { ok: true, stop }
}
