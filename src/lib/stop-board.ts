import { loadCitybusBoard } from "@/lib/citybus-feed"
import { loadGmbBoard } from "@/lib/gmb-feed"
import { withJointCitybus, withJointKmb } from "@/lib/joint-board"
import { loadKmbBoard } from "@/lib/kmb-feed"
import { loadMtrBusBoard } from "@/lib/mtr-bus-feed"
import { loadNlbBoard } from "@/lib/nlb-feed"
import type { CitybusStopBoard, KmbStopBoard } from "@/lib/types"

export const STOP_OPERATORS = ["kmb", "citybus", "gmb", "nlb", "mtrbus"] as const

export type StopOperator = (typeof STOP_OPERATORS)[number]

export type StopBoard = KmbStopBoard | CitybusStopBoard

export function isStopOperator(value: string | null): value is StopOperator {
  return value === "kmb" || value === "citybus" || value === "gmb" || value === "nlb" || value === "mtrbus"
}

export async function loadStopBoard(op: StopOperator, id: string): Promise<{ ok: true; stop: StopBoard } | { ok: false }> {
  switch (op) {
    case "kmb": {
      const board = await loadKmbBoard(id)
      if (!board.ok) return board
      return { ok: true, stop: await withJointKmb(board.stop) }
    }
    case "citybus": {
      const board = await loadCitybusBoard(id)
      if (!board.ok) return board
      return { ok: true, stop: await withJointCitybus(board.stop) }
    }
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
