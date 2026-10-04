// Shared by the AI routes (/api/briefing, /api/ask): the Worker's env, AI keys, and the live feeds.
import { GET as getApproaches } from "@/app/api/approaches/route"
import { GET as getControlPoints } from "@/app/api/control-points/route"
import { GET as getIncidents } from "@/app/api/incidents/route"
import { GET as getTraffic } from "@/app/api/traffic/route"
import { GET as getWarnings } from "@/app/api/warnings/route"
import type { AskInput } from "@/lib/ask-facts"
import { fastestCrossings, type BriefingInput } from "@/lib/briefing-facts"
import type { ApproachesResponse, ControlPointsResponse, IncidentsResponse, TrafficResponse, WarningsResponse } from "@/lib/types"

export type Env = Record<string, unknown> & { SELF?: { fetch: (request: Request) => Promise<Response> } }
export type AiKeys = { deepseek?: string; anthropic?: string; typesafe?: string; openrouter?: string }
export type Load = (path: string) => Promise<Response>

export type CityFeeds = {
  traffic: TrafficResponse | null
  approaches: ApproachesResponse | null
  incidents: IncidentsResponse | null
  warnings: WarningsResponse | null
  controlPoints: ControlPointsResponse | null
}

export async function workerEnv(): Promise<Env> {
  try {
    return (await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ "cloudflare:workers")).env as Env
  } catch {
    return {} // Not running in workerd.
  }
}

// Cloudflare secrets in the Worker; .env under the Node dev server.
export function aiKeys(env: Env): AiKeys {
  const pick = (name: string) => {
    const value = env[name] ?? process.env[name]
    return typeof value === "string" && value.length > 0 ? value : undefined
  }
  return { deepseek: pick("DEEPSEEK_API_KEY"), anthropic: pick("ANTHROPIC_API_KEY"), typesafe: pick("TYPESAFE_API_KEY"), openrouter: pick("OPENROUTER_API_KEY") }
}

// On Cloudflare each feed is read through the SELF binding, one request each: read in-process,
// the feeds together passed the free plan's 50 subrequests per invocation on a cold cache.
// The Node dev server has no binding, so it calls the routes directly.
export function feedLoader(env: Env, origin: string): Load {
  const self = env.SELF
  if (self) return (path) => self.fetch(new Request(`${origin}${path}`))
  return (path) => {
    if (path.startsWith("/api/traffic")) return getTraffic(new Request(`${origin}${path}`))
    if (path.startsWith("/api/approaches")) return getApproaches()
    if (path.startsWith("/api/incidents")) return getIncidents()
    if (path.startsWith("/api/control-points")) return getControlPoints()
    return getWarnings(new Request(`${origin}${path}`))
  }
}

// A feed that fails is null, so the AI is told what is missing rather than the whole answer failing.
export async function readCityFeeds(load: Load, withBoundary: boolean): Promise<CityFeeds> {
  const read = async <T,>(path: string): Promise<T | null> => {
    try {
      const response = await load(path)
      if (!response.ok) return null
      const body = (await response.json()) as T & { ok?: boolean }
      return body.ok === false ? null : body
    } catch {
      return null
    }
  }
  const [traffic, approaches, incidents, warnings, controlPoints] = await Promise.all([
    read<TrafficResponse>("/api/traffic"),
    read<ApproachesResponse>("/api/approaches"),
    read<IncidentsResponse>("/api/incidents"),
    read<WarningsResponse>("/api/warnings?lang=en"),
    withBoundary ? read<ControlPointsResponse>("/api/control-points") : Promise.resolve(null),
  ])
  return { traffic, approaches, incidents, warnings, controlPoints }
}

// The parts of the feeds the briefing facts are written from.
export function briefingInput(feeds: CityFeeds): BriefingInput {
  return {
    at: new Date(),
    traffic: feeds.traffic,
    crossings: fastestCrossings(feeds.approaches?.points ?? []),
    incidents: (feeds.incidents?.incidents.features ?? []).map((feature) => {
      const p = (feature.properties ?? {}) as Record<string, string | undefined>
      return { tc: p.nameTc ?? "", en: p.name ?? "", whereTc: p.location ?? "", whereEn: p.locationEn ?? "" }
    }),
    warnings: (feeds.warnings?.warnings ?? []).map((row) => ({ name: row.name })),
    conditions: feeds.warnings?.conditions ?? null,
  }
}

// The parts of the feeds a question is answered from: every start and every boundary hall.
export function askInput(feeds: CityFeeds): AskInput {
  const base = briefingInput(feeds)
  return {
    at: base.at,
    traffic: base.traffic,
    starts: feeds.approaches?.points ?? [],
    incidents: base.incidents,
    warnings: base.warnings,
    conditions: base.conditions,
    halls: feeds.controlPoints ? feeds.controlPoints.points.features : null,
  }
}
