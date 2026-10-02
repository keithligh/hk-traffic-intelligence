"use client"

import { useEffect, useState, type KeyboardEvent } from "react"
import { flushSync } from "react-dom"
import { useI18n } from "@/components/locale"
import { boundaryGlance } from "@/lib/control-points"
import { bestCrossings } from "@/lib/crossings"
import { harbourChoice, pickOrigin, type HarbourCode } from "@/lib/harbour-choice"
import { displayText, formatClock, LOCALE_MARK, LOCALES, type Messages } from "@/lib/i18n"
import { CHANGELOG, changelogText } from "@/lib/changelog"
import { INTEL_TABS, intelBoard, type IntelItem, type IntelTab } from "@/lib/intel"
import { formatSpeed } from "@/lib/speed"
import type { ApproachesResponse, ApproachPoint, HarbourJourney, TrafficResponse, WeatherConditions, WeatherWarning } from "@/lib/types"
import { weatherBar } from "@/lib/warnings"

type OpsHudProps = {
  traffic: TrafficResponse | null
  trafficLoading: boolean
  trafficError: string | null
  approaches: ApproachesResponse | null
  approachesError: string | null
  incidents: GeoJSON.FeatureCollection | null
  incidentsError: string | null
  works: GeoJSON.FeatureCollection | null
  controlPoints: GeoJSON.FeatureCollection | null
  controlError: string | null
  warnings: WeatherWarning[]
  warningsReady: boolean
  warningsError: string | null
  conditions: WeatherConditions | null
  mapLive: boolean
  pictureError: string | null
  mtrError: string | null
  kmbError: string | null
  lrtError: string | null
  citybusError: string | null
  gmbError: string | null
  nlbError: string | null
  ferryError: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onFocus: (focus: { id: string; coordinates: [number, number] }) => void
}

const TONE: Record<HarbourJourney["colour"], string> = {
  red: "#FF5D73",
  amber: "#FFC857",
  green: "#3DDC97",
  none: "#C9D2DC",
}

const BAR_KEY = {
  CH: "cross",
  EH: "eastern",
  WH: "western",
} as const

export function OpsHud(props: OpsHudProps) {
  const { locale, setLocale, messages: m } = useI18n()
  const clock = useHongKongClock(locale)
  const [tab, setTab] = useState<IntelTab>("ranked")
  const [barOpen, setBarOpen] = useState(true)
  const [harbourOpen, setHarbourOpen] = useState(false)
  const open = props.open
  const crossings = bestCrossings(props.approaches?.ok ? props.approaches.points : [])
  const summary = props.traffic?.ok ? props.traffic.summary : null
  const totalBands = summary ? summary.free + summary.slow + summary.congested : 0
  const live = Boolean(summary) && !props.trafficError
  const board = intelBoard({
    trafficError: props.trafficError,
    traffic: props.traffic,
    incidents: props.incidents,
    incidentsError: props.incidentsError,
    works: props.works,
    controlPoints: props.controlPoints,
    controlError: props.controlError,
    approaches: props.approaches?.ok ? props.approaches.points : [],
    approachesError: props.approachesError,
    warnings: props.warnings,
    warningsReady: props.warningsReady,
    warningsError: props.warningsError,
    conditions: props.conditions,
    pictureError: props.pictureError,
    mtrError: props.mtrError,
    kmbError: props.kmbError,
    lrtError: props.lrtError,
    citybusError: props.citybusError,
    gmbError: props.gmbError,
    nlbError: props.nlbError,
    ferryError: props.ferryError,
    mapError: props.mapLive ? null : m.mapFailed,
  }, m)
  const intel = board[tab]
  const urgentCount = intel.filter((item) => item.urgent).length
  const marqueeSeconds = Math.max(28, intel.length * 9)
  const halls = boundaryGlance(props.controlPoints, props.controlError, m)
  const weather = weatherBar(props.warnings, props.conditions)
  const incidentCount = props.incidents?.features.length ?? 0
  const firstIncident = board.roads.find((item) => item.kind === "incident" && item.coordinates)
  const worstRoad = board.roads.find((item) => item.coordinates && (item.kind === "jam" || item.kind === "slow" || item.kind === "incident"))
  const worstHall = board.boundary.find((item) => item.coordinates)
  const changeOpen = (next: boolean) => {
    if (next === open) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced || typeof document.startViewTransition !== "function") {
      props.onOpenChange(next)
      return
    }
    try {
      document.startViewTransition(() => {
        flushSync(() => props.onOpenChange(next))
      })
    } catch {
      props.onOpenChange(next)
    }
  }
  const show = (next: IntelTab, item: IntelItem | undefined) => {
    setTab(next)
    changeOpen(true)
    if (item?.coordinates) props.onFocus({ id: item.id, coordinates: item.coordinates })
  }
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      if (window.matchMedia("(min-width: 1024px)").matches) {
        root.style.removeProperty("--map-control-top")
        return
      }
      const header = document.querySelector<HTMLElement>("[data-map-chrome='top']")
      const box = header?.getBoundingClientRect()
      if (!box || box.height < 2 || box.left > 56) {
        root.style.removeProperty("--map-control-top")
        return
      }
      root.style.setProperty("--map-control-top", `${Math.ceil(box.bottom + 6)}px`)
    }
    apply()
    const header = document.querySelector("[data-map-chrome='top']")
    const observer = new ResizeObserver(apply)
    if (header) observer.observe(header)
    window.addEventListener("resize", apply)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", apply)
      root.style.removeProperty("--map-control-top")
    }
  }, [barOpen, locale])
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {barOpen ? null : (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setBarOpen(true)}
          className="pointer-events-auto absolute top-2 left-2 border border-cyan-200/30 bg-[#041018]/88 px-2 py-1 font-[family-name:var(--font-hud)] text-sm text-white sm:hidden"
        >
          {m.productName}
        </button>
      )}
      <header
        data-map-chrome="top"
        className={`pointer-events-auto absolute top-2 right-2 left-2 flex flex-col gap-1 overflow-x-clip border border-cyan-200/30 bg-[#041018]/80 px-1.5 py-1 shadow-[0_0_24px_rgba(34,211,238,0.08)] backdrop-blur-md sm:top-3 sm:right-3 sm:left-3 sm:gap-1.5 sm:px-2 sm:py-1.5 sm:flex-row sm:items-center lg:right-4 lg:left-16 ${
          barOpen ? "" : "max-sm:hidden"
        } ${harbourOpen ? "z-[7]" : ""}`}
      >
        <div className="flex shrink-0 items-center gap-2 pr-1 sm:gap-3">
          <div>
            <p className="hidden font-[family-name:var(--font-hud)] text-[0.62rem] tracking-[0.18em] text-cyan-200/80 uppercase sm:block">{m.productMark}</p>
            <p className="font-[family-name:var(--font-hud)] text-sm whitespace-nowrap text-white">{m.productName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:block">
            <p className="font-[family-name:var(--font-hud)] text-sm text-cyan-50 tabular-nums">{clock}</p>
            <p className="flex items-center gap-1.5 font-[family-name:var(--font-hud)] text-[0.62rem] tracking-[0.14em] text-cyan-100 uppercase">
              <span className={`size-1.5 rounded-full ${live ? "hud-pulse bg-[#3DDC97]" : "bg-[#FFC857]"}`} />
              {live ? m.live : props.trafficLoading ? m.sync : m.fault}
              {props.mapLive ? "" : ` · ${m.mapOff}`}
            </p>
          </div>
          <div className="inline-flex shrink-0 border border-white/15" role="group" aria-label={m.language}>
            {LOCALES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={locale === item}
                onClick={() => setLocale(item)}
                className={`px-1.5 py-1 font-[family-name:var(--font-hud)] text-[0.65rem] ${
                  locale === item ? "bg-white/10 text-white" : "text-cyan-100/70"
                }`}
              >
                {LOCALE_MARK[item]}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-expanded={open && tab === "notes"}
            onClick={() => show("notes", undefined)}
            className="shrink-0 border border-cyan-200/50 bg-cyan-300/10 px-2 py-1 font-[family-name:var(--font-hud)] text-[0.65rem] tracking-[0.12em] text-cyan-50"
          >
            {m.changelog}
          </button>
          <button
            type="button"
            aria-expanded={barOpen}
            onClick={() => setBarOpen(false)}
            className="ml-auto shrink-0 border border-white/15 px-1.5 py-1 font-[family-name:var(--font-hud)] text-[0.65rem] text-cyan-50 sm:hidden"
          >
            {m.hide}
          </button>
        </div>
        <div className="@container/bar flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-clip sm:gap-1.5">
          {crossings.map((crossing) => (
            <Metric
              key={crossing.code}
              label={BAR_KEY[crossing.code] ? m[BAR_KEY[crossing.code]] : crossing.label}
              value={m.minutes(crossing.minutes)}
              tone={TONE[crossing.colour]}
              hint={m.approachHint(displayText(m.locale, crossing.fromTc, crossing.from))}
              expanded={harbourOpen}
              onClick={() => setHarbourOpen((value) => !value)}
            />
          ))}
          {incidentCount > 0 ? (
            <Metric
              label={m.incident}
              value={m.incidentsOpen(incidentCount)}
              tone={TONE.red}
              hint={m.incidentHint}
              onClick={() => show("roads", firstIncident)}
            />
          ) : null}
          <Metric
            label={m.boundary}
            value={halls.label}
            tone={TONE[halls.tone]}
            hint={m.boundaryHint}
            className="hidden @min-[36rem]/bar:block"
            onClick={() => show("boundary", worstHall)}
          />
          {weather ? (
            <Metric
              label={m.weather}
              value={weather.label}
              tone={TONE[weather.tone]}
              hint={m.weatherHint}
              className="hidden @min-[42rem]/bar:block"
              onClick={() => show("weather", undefined)}
            />
          ) : null}
          <button
            type="button"
            onClick={() => show("roads", worstRoad)}
            className="block shrink-0 border border-white/10 bg-black/30 px-1.5 py-1 text-left sm:ml-auto sm:px-2"
            title={bandTitle(summary, m)}
          >
            <p className="font-[family-name:var(--font-hud)] text-[0.58rem] tracking-[0.14em] text-cyan-100/80 uppercase">{m.network}</p>
            <div className="flex items-center gap-2">
              <p className="font-[family-name:var(--font-hud)] text-sm leading-none text-white tabular-nums sm:text-base">
                {props.trafficLoading ? "…" : formatSpeed(summary?.meanSpeedKmh ?? null)}
              </p>
              {summary && totalBands > 0 ? (
                <div className="mt-1 hidden h-1.5 w-14 overflow-hidden bg-white/10 @min-[32rem]/bar:flex" aria-label={bandTitle(summary, m)}>
                  <span className="bg-[#3DDC97]" style={{ width: `${(summary.free / totalBands) * 100}%` }} />
                  <span className="bg-[#FFC857]" style={{ width: `${(summary.slow / totalBands) * 100}%` }} />
                  <span className="bg-[#FF5D73]" style={{ width: `${(summary.congested / totalBands) * 100}%` }} />
                </div>
              ) : null}
            </div>
          </button>
        </div>
        {harbourOpen ? (
          <HarbourCard
            points={props.approaches?.ok ? props.approaches.points : []}
            capturedAt={props.approaches?.ok ? props.approaches.capturedAt : null}
            onClose={() => setHarbourOpen(false)}
            onFocus={props.onFocus}
          />
        ) : null}
      </header>
      <section
        id="harbour-intel"
        data-map-chrome="panel"
        className={
          open
            ? "pointer-events-auto absolute right-3 bottom-36 z-[6] w-[min(22rem,calc(100%-1.5rem))] border border-cyan-200/30 bg-[#041018]/88 shadow-[0_0_24px_rgba(34,211,238,0.08)] backdrop-blur-md lg:right-4 lg:bottom-14"
            : "pointer-events-auto absolute inset-x-0 bottom-14 z-[6] border-t border-cyan-200/30 bg-[#041018]/88 shadow-[0_0_24px_rgba(34,211,238,0.08)] backdrop-blur-md"
        }
      >
        <div className="flex items-center gap-1 px-1.5 py-1">
          {open ? (
            <>
              <div role="tablist" aria-label={m.intel} className="flex min-w-0 flex-1 flex-wrap gap-0.5">
                {INTEL_TABS.map((id, index) => {
                  const selected = tab === id
                  const urgent = board[id].some((row) => row.urgent)
                  return (
                    <button
                      key={id}
                      id={`intel-tab-${id}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls="harbour-intel-list"
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setTab(id)}
                      onKeyDown={(event) => onTabKey(event, index, setTab)}
                      className={`inline-flex shrink-0 items-center gap-1 px-1.5 py-1 font-[family-name:var(--font-hud)] text-[0.62rem] tracking-[0.08em] uppercase ${
                        selected ? "border-b-2 border-cyan-200 text-white" : "border-b-2 border-transparent text-cyan-100/70"
                      }`}
                    >
                      {tabLabel(id, m)}
                      {urgent ? <span className="size-1 rounded-full bg-[#FF5D73]" /> : null}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                aria-expanded={open}
                aria-controls="harbour-intel-list"
                onClick={() => changeOpen(false)}
                className="ml-auto shrink-0 border border-white/15 px-2 py-1 font-[family-name:var(--font-hud)] text-[0.65rem] tracking-[0.12em] text-cyan-50 uppercase"
              >
                {m.hide}
              </button>
            </>
          ) : (
            <>
              <span className="shrink-0 font-[family-name:var(--font-hud)] text-[0.62rem] tracking-[0.14em] text-cyan-100/70 uppercase">
                {tabLabel(tab, m)}
              </span>
              {tab === "notes" ? (
                <p className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                  {CHANGELOG[0] ? changelogText(CHANGELOG[0], locale) : m.changelog}
                </p>
              ) : (
                <IntelMarquee items={intel} empty={emptyCopy(tab, m)} seconds={marqueeSeconds} onFocus={props.onFocus} />
              )}
              {urgentCount > 0 ? (
                <span className="shrink-0 font-[family-name:var(--font-hud)] text-[0.65rem] tracking-[0.12em] text-[#FF5D73] uppercase">{urgentCount}</span>
              ) : null}
              <button
                type="button"
                aria-expanded={open}
                aria-controls="harbour-intel-list"
                onClick={() => changeOpen(true)}
                className="ml-1 shrink-0 border border-white/15 px-2 py-1 font-[family-name:var(--font-hud)] text-[0.65rem] tracking-[0.12em] text-cyan-50 uppercase"
              >
                {m.intel}
              </button>
            </>
          )}
        </div>
        {open ? (
          <div
            id="harbour-intel-list"
            role="tabpanel"
            aria-labelledby={`intel-tab-${tab}`}
            className="intel-scroll max-h-[min(26rem,46dvh)] overflow-y-auto border-t border-white/10 px-2 py-2"
          >
            {tab === "notes" ? (
              <ChangelogList />
            ) : intel.length === 0 ? (
              <p className="px-1 py-2 text-sm text-zinc-300">{emptyCopy(tab, m)}</p>
            ) : (
              <ol className="flex flex-col gap-1">
                {intel.map((item) => (
                  <li key={item.id}>
                    <IntelRow item={item} onFocus={props.onFocus} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </section>
    </div>
  )
}

function Metric(props: { label: string; value: string; tone: string; hint?: string; className?: string; expanded?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-expanded={props.expanded}
      title={props.hint}
      className={`block shrink-0 border border-white/10 bg-black/30 px-1.5 py-1 text-left sm:px-2 ${props.className ?? ""}`}
    >
      <p className="font-[family-name:var(--font-hud)] text-[0.58rem] tracking-[0.14em] text-cyan-100/80 uppercase">{props.label}</p>
      <p className="font-[family-name:var(--font-hud)] text-sm leading-none whitespace-nowrap tabular-nums sm:text-base" style={{ color: props.tone }}>
        {props.value}
      </p>
    </button>
  )
}

function ChangelogList() {
  const { locale, messages: m } = useI18n()
  const kind = {
    added: m.changelogAdded,
    fixed: m.changelogFixed,
    improved: m.changelogImproved,
  }
  return (
    <ol className="flex flex-col gap-2">
      {CHANGELOG.map((entry) => (
        <li key={entry.id} className="border border-white/10 bg-black/20 px-2 py-1.5">
          <p className="flex flex-wrap items-center gap-2 font-[family-name:var(--font-hud)] text-[0.62rem] tracking-[0.08em] text-cyan-100/80 uppercase">
            <time dateTime={entry.date}>{changelogDay(entry.date, locale)}</time>
            <span className="text-cyan-50">{kind[entry.kind]}</span>
          </p>
          <p className="mt-1 text-sm leading-5 text-zinc-100">{changelogText(entry, locale)}</p>
        </li>
      ))}
    </ol>
  )
}

function changelogDay(date: string, locale: ReturnType<typeof useI18n>["locale"]): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(Date.parse(`${date}T00:00:00+08:00`))
}

const ORIGIN_KEY = "harbour-origin"

const FULL_KEY: Record<HarbourCode, "crossFull" | "easternFull" | "westernFull"> = {
  CH: "crossFull",
  EH: "easternFull",
  WH: "westernFull",
}

function readOrigin(): string | null {
  try {
    return window.localStorage.getItem(ORIGIN_KEY)
  } catch {
    return null
  }
}

function saveOrigin(id: string) {
  try {
    window.localStorage.setItem(ORIGIN_KEY, id)
  } catch {
    // Private windows can refuse storage; the card still works for this visit.
  }
}

function HarbourCard(props: {
  points: ApproachPoint[]
  capturedAt: string | null
  onClose: () => void
  onFocus: OpsHudProps["onFocus"]
}) {
  const { messages: m } = useI18n()
  // Read once when the card opens, so the server render never touches storage.
  const [chosen, setChosen] = useState<string | null>(readOrigin)
  const origin = pickOrigin(props.points, chosen)
  const options = origin ? harbourChoice(origin) : []
  const slowest = Math.max(1, ...options.map((row) => row.minutes))
  const place = (point: ApproachPoint) => displayText(m.locale, point.nameTc, point.name)
  const groups = [
    { label: m.fromIsland, points: props.points.filter((point) => point.id.startsWith("H")) },
    { label: m.fromKowloon, points: props.points.filter((point) => !point.id.startsWith("H")) },
  ]
  const choose = (id: string) => {
    setChosen(id)
    saveOrigin(id)
    const point = props.points.find((item) => item.id === id)
    if (point) props.onFocus({ id: `harbour-origin-${point.id}`, coordinates: point.coordinates })
  }
  return (
    <section
      aria-label={m.harbourChoice}
      className="absolute top-full left-0 mt-1 w-[min(22rem,calc(100vw-1rem))] border border-cyan-200/30 bg-[#041018]/92 p-2 shadow-[0_0_24px_rgba(34,211,238,0.12)] backdrop-blur-md"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-[family-name:var(--font-hud)] text-[0.62rem] tracking-[0.18em] text-cyan-200/80 uppercase">{m.harbourChoice}</p>
        <button
          type="button"
          onClick={props.onClose}
          className="border border-white/15 px-1.5 py-0.5 font-[family-name:var(--font-hud)] text-[0.65rem] text-cyan-50"
        >
          {m.hide}
        </button>
      </div>
      <label className="mt-2 block">
        <span className="font-[family-name:var(--font-hud)] text-[0.58rem] tracking-[0.14em] text-cyan-100/80 uppercase">{m.harbourFrom}</span>
        <select
          value={origin?.id ?? ""}
          onChange={(event) => choose(event.target.value)}
          className="mt-0.5 block w-full border border-white/15 bg-black/40 px-1.5 py-1 text-sm text-white"
        >
          {groups.map((group) =>
            group.points.length > 0 ? (
              <optgroup key={group.label} label={group.label}>
                {group.points.map((point) => (
                  <option key={point.id} value={point.id}>
                    {place(point)}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
      </label>
      {options.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-300">{m.harbourNone}</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-1.5">
          {options.map((row) => (
            <li key={row.code}>
              <button
                type="button"
                onClick={() => origin && props.onFocus({ id: `harbour-origin-${origin.id}`, coordinates: origin.coordinates })}
                className={`block w-full border px-2 py-1.5 text-left hover:bg-white/5 ${row.fastest ? "border-[#3DDC97]/60 bg-[#3DDC97]/10" : "border-white/10 bg-black/30"}`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-white">{m[FULL_KEY[row.code]]}</span>
                  <span className="font-[family-name:var(--font-hud)] text-base leading-none tabular-nums" style={{ color: TONE[row.colour] }}>
                    {m.minutes(row.minutes)}
                  </span>
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden bg-white/10">
                    <span className="block h-full" style={{ width: `${(row.minutes / slowest) * 100}%`, background: TONE[row.colour] }} />
                  </span>
                  <span
                    className={`shrink-0 font-[family-name:var(--font-hud)] text-[0.62rem] tracking-[0.12em] uppercase ${row.fastest ? "text-[#3DDC97]" : "text-zinc-300"}`}
                  >
                    {row.fastest ? m.fastest : m.slowerBy(row.delta)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {props.capturedAt ? (
        <p className="mt-2 text-right font-[family-name:var(--font-hud)] text-[0.58rem] text-zinc-400 tabular-nums">{props.capturedAt.replace("T", " ").slice(0, 16)}</p>
      ) : null}
    </section>
  )
}

function tabLabel(id: IntelTab, m: Messages): string {
  switch (id) {
    case "ranked":
      return m.ranked
    case "roads":
      return m.roads
    case "boundary":
      return m.boundary
    case "weather":
      return m.weather
    case "systems":
      return m.systems
    case "notes":
      return m.changelog
    default: {
      const exhaustive: never = id
      return exhaustive
    }
  }
}

function bandTitle(summary: { free: number; slow: number; congested: number } | null, m: ReturnType<typeof useI18n>["messages"]): string {
  if (!summary) return m.network
  return `${m.good} ${summary.free}, ${m.average} ${summary.slow}, ${m.bad} ${summary.congested}`
}

function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number, setTab: (tab: IntelTab) => void) {
  const last = INTEL_TABS.length - 1
  let next = index
  if (event.key === "ArrowRight") next = index === last ? 0 : index + 1
  else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1
  else if (event.key === "Home") next = 0
  else if (event.key === "End") next = last
  else return
  event.preventDefault()
  const id = INTEL_TABS[next]
  if (!id) return
  setTab(id)
  requestAnimationFrame(() => document.getElementById(`intel-tab-${id}`)?.focus())
}

function IntelMarquee(props: { items: IntelItem[]; empty: string; seconds: number; onFocus: OpsHudProps["onFocus"] }) {
  const { messages } = useI18n()
  const items = props.items.length > 0 ? props.items : [quietItem(props.empty, messages.clear)]
  return (
    <div className="min-w-0 flex-1 overflow-hidden" aria-label={messages.intel}>
      <div className="intel-marquee flex w-max" style={{ animationDuration: `${props.seconds}s` }}>
        {[0, 1].map((copy) => (
          <div key={copy} className="intel-marquee-copy flex shrink-0 items-center" aria-hidden={copy === 1}>
            {items.map((item) => (
              <button
                key={`${copy}-${item.id}`}
                type="button"
                tabIndex={copy === 1 ? -1 : 0}
                disabled={item.coordinates == null}
                onClick={() => {
                  if (!item.coordinates) return
                  props.onFocus({ id: item.id, coordinates: item.coordinates })
                }}
                className="mx-5 whitespace-nowrap font-[family-name:var(--font-hud)] text-[0.72rem] text-cyan-50 disabled:cursor-default"
              >
                <span style={{ color: TONE[item.tone] }}>{item.label}</span>
                <span className="text-white"> · {item.title}</span>
                {item.detail ? <span className="text-zinc-300"> — {item.detail}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function IntelRow(props: { item: IntelItem; onFocus: OpsHudProps["onFocus"] }) {
  const { item } = props
  return (
    <button
      type="button"
      disabled={item.coordinates == null}
      onClick={() => {
        if (!item.coordinates) return
        props.onFocus({ id: item.id, coordinates: item.coordinates })
      }}
      className="flex w-full items-start gap-2 px-1 py-1 text-left enabled:hover:bg-white/5 disabled:cursor-default"
    >
      <span className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: TONE[item.tone] }} />
      <span className="min-w-0">
        <span className="block font-[family-name:var(--font-hud)] text-[0.62rem] tracking-[0.14em] text-cyan-100/80 uppercase">{item.label}</span>
        <span className="block text-sm text-white">{item.title}</span>
        {item.detail ? <span className="block text-xs text-zinc-300">{item.detail}</span> : null}
      </span>
    </button>
  )
}

function quietItem(title: string, label: string): IntelItem {
  return {
    id: "intel-clear",
    kind: "slow",
    score: 0,
    urgent: false,
    label,
    title,
    detail: "",
    tone: "green",
    coordinates: null,
  }
}

const CLOCK_PLACEHOLDER = "--:--:--"

function emptyCopy(tab: IntelTab, m: ReturnType<typeof useI18n>["messages"]): string {
  switch (tab) {
    case "ranked":
      return m.emptyRanked
    case "roads":
      return m.emptyRoads
    case "boundary":
      return m.emptyBoundary
    case "weather":
      return m.emptyWeather
    case "systems":
      return m.emptySystems
    case "notes":
      return m.changelog
    default: {
      const exhaustive: never = tab
      return exhaustive
    }
  }
}

function useHongKongClock(locale: ReturnType<typeof useI18n>["locale"]): string {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [])
  if (!now) return CLOCK_PLACEHOLDER
  return formatClock(now, locale)
}
