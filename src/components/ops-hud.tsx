"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { Fold, FoldMark } from "@/components/fold-mark"
import { layerLabel } from "@/components/layer-dock"
import { STAR_PATH } from "@/lib/place-star"
import { useI18n } from "@/components/locale"
import { boundaryGlance } from "@/lib/control-points"
import { crossingsFrom, nearestApproach } from "@/lib/crossings"
import { displayText, formatClock, LOCALE_MARK, LOCALES, type Messages } from "@/lib/i18n"
import { CHANGELOG, changelogIsFresh, changelogText } from "@/lib/changelog"
import {
  mergePlaces,
  placesFile,
  placesServerSnapshot,
  placesSnapshot,
  readPlacesFile,
  replacePlaces,
  subscribePlaces,
  togglePlace,
  type Favourite,
} from "@/lib/favourites"
import type { BoardFault } from "@/lib/board-status"
import { layerForIntel } from "@/lib/intel-focus"
import { firstOpenBoundary, INTEL_TABS, intelBoard, type IntelItem, type IntelTab } from "@/lib/intel"
import { INTEL_PHONE_QUERY, preferenceServerSnapshot, preferenceSnapshot, subscribePreferences, updatePreference } from "@/lib/preferences"
import { formatSpeed } from "@/lib/speed"
import { PLACE_FOCUS_ZOOM } from "@/lib/kmb-view"
import type { ApproachPoint, ApproachesResponse, HarbourJourney, TrafficResponse, WatchLayer, WeatherConditions, WeatherWarning } from "@/lib/types"
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
  mtrBusError: string | null
  ferryError: string | null
  boardFaults: readonly BoardFault[]
  open: boolean
  choice: boolean | null
  onOpenChange: (open: boolean) => void
  onFocus: (focus: { id: string; coordinates: [number, number]; layer: WatchLayer | null; zoom?: number }) => void
  view: { lng: number; lat: number; zoom: number } | null
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

function FreshDot() {
  return <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[#3DDC97]" />
}

const FOLD_MS = 280

function motionDelay(): number {
  if (typeof window === "undefined") return 0
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : FOLD_MS
}

function UpdatesMark({ fresh, label }: { fresh: boolean; label: string }) {
  return (
    <>
      {fresh ? <FreshDot /> : null}
      {label}
    </>
  )
}

export function OpsHud(props: OpsHudProps) {
  const { locale, setLocale, messages: m } = useI18n()
  const clock = useHongKongClock(locale)
  const prefs = useSyncExternalStore(subscribePreferences, preferenceSnapshot, preferenceServerSnapshot)
  const places = useSyncExternalStore(subscribePlaces, placesSnapshot, placesServerSnapshot)
  const tab = prefs.intelTab
  const setTab = (next: IntelTab) => updatePreference({ intelTab: next })
  const barOpen = prefs.barOpen
  const setBarOpen = (next: boolean) => updatePreference({ barOpen: next })
  const pinnedOrigin = prefs.pinnedOrigin
  const setPinnedOrigin = (next: string | null) => updatePreference({ pinnedOrigin: next })
  const open = props.open
  const [boxOpen, setBoxOpen] = useState(open)
  const [heldList, setHeldList] = useState<number | null>(null)
  const layoutEpoch = useRef(0)
  useEffect(() => {
    if (open) {
      setBoxOpen(true)
      return
    }
    if (motionDelay() === 0) {
      setBoxOpen(false)
      setHeldList(null)
      return
    }
    const panel = document.querySelector<HTMLElement>(".intel-panel-fold")
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      setBoxOpen(false)
      setHeldList(null)
    }
    const onEnd = (event: TransitionEvent) => {
      if (event.target !== panel || event.propertyName !== "grid-template-rows") return
      finish()
    }
    panel?.addEventListener("transitionend", onEnd)
    const id = window.setTimeout(finish, FOLD_MS + 40)
    return () => {
      finished = true
      panel?.removeEventListener("transitionend", onEnd)
      window.clearTimeout(id)
    }
  }, [open])
  const approachPoints = props.approaches?.ok ? props.approaches.points : []
  const nearest = nearestApproach(approachPoints, props.view)
  const pinned = pinnedOrigin ? approachPoints.find((point) => point.id === pinnedOrigin) ?? null : null
  const origin = pinned ?? nearest
  const crossings = crossingsFrom(origin)
  const islandPoints = approachPoints.filter((point) => point.id.startsWith("H"))
  const kowloonPoints = approachPoints.filter((point) => point.id.startsWith("K"))
  const summary = props.traffic?.ok ? props.traffic.summary : null
  const totalBands = summary ? summary.free + summary.slow + summary.congested : 0
  const live = Boolean(summary) && !props.trafficError
  const updatesFresh = changelogIsFresh(CHANGELOG)
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
    mtrBusError: props.mtrBusError,
    ferryError: props.ferryError,
    mapError: props.mapLive ? null : m.mapFailed,
    boardFaults: props.boardFaults,
  }, m)
  const intel = board[tab]
  const ranked = board.ranked
  const urgentCount = ranked.filter((item) => item.urgent).length
  const marqueeSeconds = Math.max(28, ranked.length * 9)
  const halls = boundaryGlance(props.controlPoints, props.controlError, m)
  const weather = weatherBar(props.warnings, props.conditions)
  const incidentCount = props.incidents?.features.length ?? 0
  const firstIncident = board.roads.find((item) => item.kind === "incident" && item.coordinates)
  const worstRoad = board.roads.find((item) => item.coordinates && (item.kind === "jam" || item.kind === "slow" || item.kind === "incident"))
  const worstHall = firstOpenBoundary(board.boundary)
  const changeOpen = (next: boolean) => {
    if (next === open) return
    const list = document.getElementById("harbour-intel-list")
    if (!next && list) {
      const height = Math.ceil(list.getBoundingClientRect().height)
      if (height > 0) {
        list.style.maxHeight = `${height}px`
        setHeldList(height)
      }
    } else if (list) {
      list.style.maxHeight = ""
      setHeldList(null)
    }
    props.onOpenChange(next)
  }
  const show = (next: IntelTab, item: IntelItem | undefined) => {
    setTab(next)
    changeOpen(true)
    if (item?.coordinates) props.onFocus({ id: item.id, coordinates: item.coordinates, layer: layerForIntel(item.kind) })
  }
  useEffect(() => {
    const root = document.documentElement
    const epoch = ++layoutEpoch.current
    const apply = () => {
      const narrow = window.matchMedia(INTEL_PHONE_QUERY).matches
      const attrib = document.querySelector<HTMLElement>(".maplibregl-ctrl-attrib")
      const attribBox = attrib?.getBoundingClientRect()
      if (narrow && !open && attribBox && attribBox.height > 2) {
        const clearance = Math.ceil(window.innerHeight - attribBox.top + 8)
        root.style.setProperty("--marquee-bottom", `${clearance}px`)
        root.style.setProperty("--dock-closed-bottom", `${clearance + 48}px`)
      } else {
        root.style.removeProperty("--marquee-bottom")
        root.style.removeProperty("--dock-closed-bottom")
      }
      const scroll = document.querySelector<HTMLElement>(".bar-scroll")
      if (scroll) scroll.classList.toggle("bar-scroll-more", scroll.scrollWidth > scroll.clientWidth + 2)
      const header = document.querySelector<HTMLElement>("[data-map-chrome='top']")
      const panel = document.querySelector<HTMLElement>("[data-map-chrome='panel']")
      const list = document.getElementById("harbour-intel-list")
      const headerBox = header?.getBoundingClientRect()
      const headerVisible = !!headerBox && headerBox.height > 2 && headerBox.left <= 56
      if (open && list && panel && headerVisible && headerBox) {
        const dock = document.querySelector<HTMLElement>("[data-layer-dock]")
        const zoom = document.querySelector<HTMLElement>(".maplibregl-ctrl-top-left")
        const dockBox = dock?.getBoundingClientRect()
        const zoomBox = zoom?.getBoundingClientRect()
        const dockH = dockBox && dockBox.height > 2 ? dockBox.height : 0
        const zoomH = zoomBox && zoomBox.height > 2 ? zoomBox.height : 0
        const aboveList = Math.max(0, list.getBoundingClientRect().top - panel.getBoundingClientRect().top)
        let bottomGap = narrow ? 96 : window.innerWidth >= 1024 ? 56 : 144
        if (narrow && attribBox && attribBox.height > 2) {
          bottomGap = Math.max(bottomGap, Math.ceil(window.innerHeight - attribBox.top + 14))
        }
        if (narrow) root.style.setProperty("--intel-bottom", `${bottomGap}px`)
        else root.style.removeProperty("--intel-bottom")
        const minTop = Math.ceil(headerBox.bottom + (narrow ? zoomH + dockH + 28 : 8))
        const available = window.innerHeight - bottomGap - minTop - aboveList
        root.style.setProperty("--intel-list-max", `${Math.max(72, Math.floor(available))}px`)
      } else if (!boxOpen) {
        root.style.removeProperty("--intel-list-max")
        root.style.removeProperty("--intel-bottom")
      }
      const panelBox = panel?.getBoundingClientRect()
      if (narrow && boxOpen && panelBox && panelBox.height > 80 && panelBox.top > 80) {
        root.style.setProperty("--map-dock-bottom", `${Math.ceil(window.innerHeight - panelBox.top + 8)}px`)
      } else {
        root.style.removeProperty("--map-dock-bottom")
      }
      if (!headerVisible || !headerBox || window.matchMedia("(min-width: 1024px)").matches) {
        root.style.removeProperty("--map-control-top")
        return
      }
      root.style.setProperty("--map-control-top", `${Math.ceil(headerBox.bottom + 6)}px`)
    }
    apply()
    const header = document.querySelector("[data-map-chrome='top']")
    const panel = document.querySelector("[data-map-chrome='panel']")
    const dock = document.querySelector("[data-layer-dock]")
    const observer = new ResizeObserver(apply)
    const watchCorner = () => {
      const corner = document.querySelector(".maplibregl-ctrl-bottom-right")
      if (corner) observer.observe(corner)
    }
    if (header) observer.observe(header)
    if (panel) observer.observe(panel)
    if (dock) observer.observe(dock)
    watchCorner()
    const map = document.querySelector(".maplibregl-map")
    const mutations = new MutationObserver(() => {
      watchCorner()
      apply()
    })
    if (map) mutations.observe(map, { childList: true, subtree: true })
    window.addEventListener("resize", apply)
    return () => {
      observer.disconnect()
      mutations.disconnect()
      window.removeEventListener("resize", apply)
      queueMicrotask(() => {
        if (layoutEpoch.current !== epoch) return
        root.style.removeProperty("--map-control-top")
        root.style.removeProperty("--map-dock-bottom")
        root.style.removeProperty("--intel-list-max")
        root.style.removeProperty("--intel-bottom")
        root.style.removeProperty("--marquee-bottom")
        root.style.removeProperty("--dock-closed-bottom")
      })
    }
  }, [barOpen, boxOpen, locale, open, props.mapLive])
  return (
    <div className="@container/hud pointer-events-none absolute inset-0 z-[5]">
      <Fold open={!barOpen} className="pointer-events-auto absolute top-2 left-2 z-[6] sm:hidden">
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setBarOpen(true)}
          className="inline-flex items-center gap-1.5 border border-cyan-200/30 bg-[#041018]/88 px-2 py-1 font-[family-name:var(--font-hud)] text-sm text-white"
        >
          {m.productName}
          <FoldMark open={false} />
        </button>
      </Fold>
      <Fold open={barOpen} live className="bar-fold pointer-events-auto absolute top-2 right-2 left-2 sm:top-3 sm:right-3 sm:left-3 lg:right-4 lg:left-16">
      <header
        data-map-chrome="top"
        className="ops-bar flex flex-col items-stretch gap-1 border border-cyan-200/30 bg-[#041018]/80 px-1.5 py-1 shadow-[0_0_24px_rgba(34,211,238,0.08)] backdrop-blur-md sm:gap-1.5 sm:px-2 sm:py-1.5 @min-[64rem]/hud:flex-row @min-[64rem]/hud:items-center"
      >
        <div className="flex shrink-0 items-center gap-1 sm:min-w-0 sm:flex-wrap sm:gap-3">
          <div className="min-w-0 max-w-14 sm:max-w-none">
            <p className="hidden font-[family-name:var(--font-hud)] text-[0.62rem] tracking-[0.18em] text-cyan-200/80 uppercase sm:block">{m.productMark}</p>
            <p className="truncate font-[family-name:var(--font-hud)] text-sm leading-tight text-white">{m.productName}</p>
          </div>
          <div className="shrink-0">
            <p className="font-[family-name:var(--font-hud)] text-sm text-cyan-50 tabular-nums">{clock}</p>
            <p className="flex items-center gap-1.5 font-[family-name:var(--font-hud)] text-[0.62rem] tracking-[0.14em] text-cyan-100 uppercase">
              <span className={`size-1.5 rounded-full ${live ? "hud-pulse bg-[#3DDC97]" : "bg-[#FFC857]"}`} />
              {live ? m.live : props.trafficLoading ? m.sync : m.fault}
              {props.mapLive ? "" : ` · ${m.mapOff}`}
            </p>
          </div>
          <button
            type="button"
            aria-expanded={open && tab === "notes"}
            onClick={() => show("notes", undefined)}
            className="bar-chip hidden border-cyan-200/50 bg-cyan-300/10 text-cyan-50 sm:inline-flex"
          >
            <UpdatesMark fresh={updatesFresh} label={m.changelog} />
          </button>
          <div className="flex items-stretch gap-1">
          <PlaceFind
            copy={m}
            near={props.view}
            onOpen={(place) => props.onFocus({
              id: `find-${place.layer}-${place.id}`,
              coordinates: place.coordinates,
              layer: place.layer,
              zoom: PLACE_FOCUS_ZOOM,
            })}
          />
          <PlacesMenu
            places={places}
            copy={m}
            onOpen={(place) => props.onFocus({
              id: `place-${place.layer}-${place.id}`,
              coordinates: place.coordinates,
              layer: place.layer,
              zoom: PLACE_FOCUS_ZOOM,
            })}
            onRemove={(place) => replacePlaces(togglePlace(places, place))}
            onExport={() => downloadPlaces(places)}
            onImport={(incoming) => replacePlaces(mergePlaces(places, incoming))}
          />
          </div>
        </div>
        <div className="ops-bar-read flex min-w-0 flex-1 items-center gap-1 max-sm:w-full max-sm:flex-none">
          <div className="ops-times flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          {origin ? (["CH", "EH", "WH"] as const).map((code) => {
            const crossing = crossings.find((item) => item.code === code)
            if (!crossing) {
              return (
                <Metric
                  key={code}
                  label={m[BAR_KEY[code]]}
                  value={m.harbourMissing}
                  tone={TONE.none}
                  hint={m.harbourMissingHint}
                  onClick={() => {
                    if (origin) props.onFocus({ id: `harbour-origin-${origin.id}`, coordinates: origin.coordinates, layer: null })
                  }}
                />
              )
            }
            const road = displayText(m.locale, crossing.fromTc, crossing.from)
            const compare = crossing.slower > 0 ? m.slowerBy(crossing.slower) : m.fastestHere
            return (
              <Metric
                key={crossing.code}
                label={m[BAR_KEY[crossing.code]]}
                value={m.minutes(crossing.minutes)}
                tone={TONE[crossing.colour]}
                hint={`${m.approachHint(road)} ${compare}`}
                onClick={() => props.onFocus({ id: `crossing-${crossing.code}`, coordinates: crossing.coordinates, layer: "tolls" })}
              />
            )
          }) : null}
          </div>
          <div className="ops-phone-more">
          {origin ? (
            <OriginMenu
              pinnedId={pinned?.id ?? null}
              nearest={nearest}
              island={islandPoints}
              kowloon={kowloonPoints}
              onChoose={(id) => {
                setPinnedOrigin(id)
                const point = id ? approachPoints.find((item) => item.id === id) : nearest
                if (point) props.onFocus({ id: `harbour-origin-${point.id}`, coordinates: point.coordinates, layer: null })
              }}
            />
          ) : null}
          <div className="ops-more bar-scroll flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto sm:gap-1.5">
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
            onClick={() => show("boundary", worstHall)}
          />
          {weather ? (
            <Metric
              label={m.weather}
              value={/^\d+°C/.test(weather.label) ? (weather.label.split(" · ")[0] ?? weather.label) : weather.label}
              tone={TONE[weather.tone]}
              hint={weather.label}
              onClick={() => show("weather", undefined)}
            />
          ) : null}
          <button
            type="button"
            aria-expanded={open && tab === "notes"}
            onClick={() => show("notes", undefined)}
            className="bar-chip border-cyan-200/50 bg-cyan-300/10 text-cyan-50 sm:hidden"
          >
            <UpdatesMark fresh={updatesFresh} label={m.changelog} />
          </button>
          </div>
          <button
            type="button"
            aria-expanded={barOpen}
            onClick={() => setBarOpen(false)}
            className="ops-hide inline-flex shrink-0 items-center gap-1 border border-white/15 px-1.5 py-1 font-[family-name:var(--font-hud)] text-[0.65rem] text-cyan-50 sm:hidden"
          >
            {m.hide}
            <FoldMark open />
          </button>
          </div>
          <button
            type="button"
            onClick={() => show("roads", worstRoad)}
            className="ops-speed block shrink-0 border border-white/10 bg-black/30 px-0.5 py-1 text-left sm:px-2"
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
          <div className="ops-lang inline-flex shrink-0 border border-white/15 sm:hidden" role="group" aria-label={m.language}>
            {LOCALES.map((item) => (
              <button
                key={`narrow-${item}`}
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
          <div className="hidden shrink-0 border border-white/15 sm:inline-flex" role="group" aria-label={m.language}>
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
        </div>
      </header>
      </Fold>
      <section
        id="harbour-intel"
        data-map-chrome="panel"
        data-intel-open={boxOpen ? "true" : props.choice === null ? undefined : "false"}
        className={
          boxOpen
            ? "pointer-events-auto absolute right-3 bottom-[var(--intel-bottom,6rem)] z-[6] w-[min(22rem,calc(100%-1.5rem))] border border-cyan-200/30 bg-[#041018]/88 shadow-[0_0_24px_rgba(34,211,238,0.08)] backdrop-blur-md sm:bottom-36 lg:right-4 lg:bottom-14"
            : "pointer-events-auto absolute inset-x-0 bottom-[var(--marquee-bottom,3.5rem)] z-[6] border-t border-cyan-200/30 bg-[#041018]/88 shadow-[0_0_24px_rgba(34,211,238,0.08)] backdrop-blur-md sm:bottom-14"
        }
      >
        <Fold open={!boxOpen} className="intel-strip-fold">
        <div className="intel-strip items-center gap-1 px-1.5 py-1">
          <span className="shrink-0 font-[family-name:var(--font-hud)] text-[0.62rem] tracking-[0.14em] text-cyan-100/70 uppercase">
            {tabLabel("ranked", m)}
          </span>
          <IntelMarquee items={ranked} empty={emptyCopy("ranked", m)} seconds={marqueeSeconds} onFocus={props.onFocus} />
          {urgentCount > 0 ? (
            <span className="shrink-0 font-[family-name:var(--font-hud)] text-[0.65rem] tracking-[0.12em] text-[#FF5D73] uppercase">{urgentCount}</span>
          ) : null}
          <button
            type="button"
            aria-expanded={props.choice === true}
            aria-controls="harbour-intel-list"
            onClick={() => changeOpen(true)}
            className="bar-chip ml-1 border-white/15 text-cyan-50 uppercase"
          >
            {m.intel}
            <FoldMark open={false} />
          </button>
        </div>
        </Fold>
        <Fold open={open} className="intel-panel-fold">
        <div className="intel-panel">
          <div className="flex items-center gap-1 px-1.5 py-1">
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
                    {id === "notes" && updatesFresh ? <FreshDot /> : null}
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
              className="bar-chip ml-auto border-white/15 text-cyan-50 uppercase"
            >
              {m.hide}
              <FoldMark open />
            </button>
          </div>
          <div
            id="harbour-intel-list"
            role="tabpanel"
            aria-labelledby={`intel-tab-${tab}`}
            style={heldList ? { maxHeight: heldList } : undefined}
            className="intel-scroll max-h-[min(26rem,46dvh,var(--intel-list-max,100dvh))] overflow-y-auto border-t border-white/10 px-2 py-2"
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
        </div>
        </Fold>
      </section>
    </div>
  )
}

function PlaceFind(props: { copy: Messages; near: { lng: number; lat: number } | null; onOpen: (place: PlaceFindRow) => void }) {
  const { locale, messages } = useI18n()
  const [query, setQuery] = useState("")
  const [places, setPlaces] = useState<PlaceFindRow[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const latest = useRef("")
  const nearRef = useRef(props.near)
  nearRef.current = props.near
  const shown = open && places.length > 0
  useEffect(() => {
    const needle = query.trim()
    latest.current = needle
    if (needle.length < 2) {
      setPlaces([])
      return
    }
    const asked = needle
    const handle = window.setTimeout(() => {
      const centre = nearRef.current
      const params = new URLSearchParams({ q: asked })
      if (centre) {
        params.set("lng", centre.lng.toFixed(3))
        params.set("lat", centre.lat.toFixed(3))
      }
      void fetch(`/api/find?${params}`)
        .then((response) => response.json())
        .then((body: { ok?: boolean; places?: PlaceFindRow[] }) => {
          if (latest.current !== asked) return
          setPlaces(body.ok && Array.isArray(body.places) ? body.places : [])
          setActive(0)
        })
        .catch(() => {
          if (latest.current === asked) setPlaces([])
        })
    }, 300)
    return () => window.clearTimeout(handle)
  }, [query])
  useEffect(() => {
    if (!shown) {
      setBox(null)
      return
    }
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(320, window.innerWidth - 16)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const top = Math.round(rect.bottom + 4)
      setBox({ top, left: Math.round(left), width: Math.round(width), maxHeight: Math.max(160, window.innerHeight - top - 8) })
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [shown, query])
  useEffect(() => {
    if (!shown) return
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [shown])
  const choose = (place: PlaceFindRow) => {
    props.onOpen(place)
    setQuery("")
    setPlaces([])
    setOpen(false)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false)
      return
    }
    if (!shown) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((index) => (index + 1) % places.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((index) => (index - 1 + places.length) % places.length)
    } else if (event.key === "Enter") {
      const place = places[active]
      if (!place) return
      event.preventDefault()
      choose(place)
    }
  }
  const listId = "place-find-list"
  return (
    <div ref={rootRef} className="relative flex self-stretch">
      <input
        value={query}
        placeholder={props.copy.placeFind}
        aria-label={props.copy.placeFind}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="bar-chip place-find text-white placeholder:text-cyan-100/80"
      />
      {shown && box
        ? createPortal(
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={props.copy.placeFind}
              className="fixed z-50 overflow-y-auto border border-cyan-200/30 bg-[#041018] text-sm text-white shadow-[0_0_24px_rgba(34,211,238,0.12)]"
              style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
            >
              {places.map((place, index) => {
                const name = displayText(locale, place.nameTc, place.nameEn)
                return (
                  <button
                    key={`${place.layer}-${place.id}`}
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    title={name}
                    className={`flex w-full items-baseline gap-2 px-2 py-1.5 text-left ${index === active ? "bg-white/10" : ""} hover:bg-white/10`}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      choose(place)
                    }}
                    onMouseEnter={() => setActive(index)}
                  >
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <span className="shrink-0 font-[family-name:var(--font-hud)] text-[0.62rem] tracking-[0.08em] text-cyan-100/70">{layerLabel(place.layer, messages)}</span>
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

type PlaceFindRow = {
  layer: WatchLayer
  id: string
  nameTc: string
  nameEn: string
  coordinates: [number, number]
}

function PlacesMenu(props: {
  places: readonly Favourite[]
  copy: Messages
  onOpen: (place: Favourite) => void
  onRemove: (place: Favourite) => void
  onExport: () => void
  onImport: (places: readonly Favourite[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) {
      setBox(null)
      return
    }
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(320, window.innerWidth - 16)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const top = Math.round(rect.bottom + 4)
      setBox({ top, left: Math.round(left), width: Math.round(width), maxHeight: Math.max(160, window.innerHeight - top - 8) })
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [open])
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])
  return (
    <div ref={rootRef} className="relative flex shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={props.copy.places}
        onClick={() => setOpen((current) => !current)}
        className={`bar-chip h-full ${open || props.places.length > 0 ? "border-[#e2b340]/70 text-[#e2b340]" : "border-white/15 text-cyan-50"}`}
      >
        <StarIcon filled={open || props.places.length > 0} className="size-[1em]" />
        {props.places.length > 0 ? <span className="tabular-nums">{props.places.length}</span> : null}
      </button>
      {box
        ? createPortal(
            <div
              ref={menuRef}
              role="dialog"
              aria-label={props.copy.places}
              className="fixed z-50 border border-cyan-200/30 bg-[#041018] p-2 text-sm text-white shadow-[0_0_24px_rgba(34,211,238,0.12)]"
              style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight, overflowY: "auto" }}
            >
              <PlaceList
                places={props.places}
                copy={props.copy}
                onOpen={(place) => {
                  props.onOpen(place)
                  setOpen(false)
                }}
                onRemove={props.onRemove}
                onExport={props.onExport}
                onImport={props.onImport}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function StarIcon(props: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={props.className ?? "size-4"}>
      <path
        d={STAR_PATH}
        fill={props.filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={props.filled ? 0 : 1.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function OriginMenu(props: {
  pinnedId: string | null
  nearest: ApproachPoint | null
  island: ApproachPoint[]
  kowloon: ApproachPoint[]
  onChoose: (id: string | null) => void
}) {
  const { locale, messages: m } = useI18n()
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(352, window.innerWidth - 16)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const top = Math.round(rect.bottom + 4)
      setBox({ top, left: Math.round(left), width: Math.round(width), maxHeight: Math.max(160, window.innerHeight - top - 8) })
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [open])
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])
  const chosen = props.pinnedId
    ? [...props.island, ...props.kowloon].find((point) => point.id === props.pinnedId) ?? props.nearest
    : props.nearest
  const road = chosen ? displayText(locale, chosen.nameTc, chosen.name) : ""
  const choose = (id: string | null) => {
    props.onChoose(id)
    setOpen(false)
  }
  return (
    <div ref={rootRef} className="ops-origin relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={m.harbourFrom}
        onClick={() => setOpen((current) => !current)}
        className="block max-w-28 border border-white/10 bg-black/30 px-1 py-1 text-left sm:max-w-56 sm:px-2"
      >
        <span className="block font-[family-name:var(--font-hud)] text-[0.58rem] tracking-[0.14em] text-cyan-100/80 uppercase">{props.pinnedId ? m.harbourFrom : m.harbourNear}</span>
        <span className="flex items-center gap-1">
          <span className="truncate font-[family-name:var(--font-hud)] text-sm leading-none text-white sm:text-base">
            {road}
          </span>
          <FoldMark open={open} />
        </span>
      </button>
      {box
        ? createPortal(
            <Fold
              open={open}
              className="fixed z-50 border border-cyan-200/30 bg-[#041018] text-sm text-white shadow-[0_0_24px_rgba(34,211,238,0.12)]"
              style={{ top: box.top, left: box.left, width: box.width }}
            >
            <div ref={menuRef} role="listbox" aria-label={m.harbourFrom} className="overflow-y-auto p-1" style={{ maxHeight: box.maxHeight }}>
              <OriginChoice selected={props.pinnedId == null} onChoose={() => choose(null)}>
                {m.followMap(props.nearest ? displayText(locale, props.nearest.nameTc, props.nearest.name) : "")}
              </OriginChoice>
              <OriginList label={m.fromIsland} points={props.island} pinnedId={props.pinnedId} onChoose={choose} />
              <OriginList label={m.fromKowloon} points={props.kowloon} pinnedId={props.pinnedId} onChoose={choose} />
            </div>
            </Fold>,
            document.body,
          )
        : null}
    </div>
  )
}

function OriginList(props: { label: string; points: ApproachPoint[]; pinnedId: string | null; onChoose: (id: string) => void }) {
  const { locale } = useI18n()
  if (props.points.length === 0) return null
  return (
    <div className="mt-1">
      <p className="px-2 py-1 font-[family-name:var(--font-hud)] text-[0.58rem] tracking-[0.14em] text-cyan-100/70 uppercase">{props.label}</p>
      {props.points.map((point) => (
        <OriginChoice key={point.id} selected={props.pinnedId === point.id} onChoose={() => props.onChoose(point.id)}>
          {displayText(locale, point.nameTc, point.name)}
        </OriginChoice>
      ))}
    </div>
  )
}

function OriginChoice(props: { selected: boolean; onChoose: () => void; children: string }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={props.selected}
      onClick={props.onChoose}
      className={`block w-full px-2 py-1.5 text-left whitespace-nowrap text-white hover:bg-white/10 ${props.selected ? "bg-white/10" : ""}`}
    >
      {props.children}
    </button>
  )
}

function Metric(props: { label: string; value: string; tone: string; hint?: string; className?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.hint}
      className={`block shrink-0 border border-white/10 bg-black/30 px-0.5 py-1 text-left sm:px-2 ${props.className ?? ""}`}
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
  const track = useRef<HTMLDivElement>(null)
  const items = props.items.length > 0 ? props.items : [quietItem(props.empty, messages.clear)]
  const line = `${props.seconds}:${items.map((item) => item.id).join("|")}`
  useEffect(() => {
    const node = track.current
    if (!node) return
    node.style.animationName = "none"
    void node.offsetWidth
    node.style.animationName = ""
  }, [line])
  return (
    <div className="min-w-0 flex-1 overflow-clip" aria-label={messages.intel}>
      <div ref={track} className="intel-marquee flex w-max" style={{ animationDuration: `${props.seconds}s` }}>
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
                  props.onFocus({ id: item.id, coordinates: item.coordinates, layer: layerForIntel(item.kind) })
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
        props.onFocus({ id: item.id, coordinates: item.coordinates, layer: layerForIntel(item.kind) })
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

function PlaceList(props: {
  places: readonly Favourite[]
  copy: Messages
  onOpen: (place: Favourite) => void
  onRemove: (place: Favourite) => void
  onExport: () => void
  onImport: (places: readonly Favourite[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [importFault, setImportFault] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      {props.places.length === 0 ? (
        <p className="px-1 py-2 text-sm text-zinc-300">{props.copy.placesEmpty}</p>
      ) : (
        <ol className="flex flex-col">
          {props.places.map((place) => (
            <li key={`${place.layer}-${place.id}`} className="flex items-start gap-2 border-t border-white/10 first:border-t-0">
              <button type="button" onClick={() => props.onOpen(place)} className="min-w-0 flex-1 px-1 py-2 text-left">
                <span className="block text-sm leading-5 text-white">{displayText(props.copy.locale, place.nameTc, place.nameEn)}</span>
                <span className="block text-xs leading-4 text-cyan-100/70">{layerLabel(place.layer, props.copy)}</span>
              </button>
              <button type="button" aria-label={props.copy.starred} aria-pressed="true" onClick={() => props.onRemove(place)} className="mt-1 grid size-7 shrink-0 place-items-center text-[#e2b340]">
                <StarIcon filled />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-1 border-t border-white/10 pt-2">
        <button type="button" onClick={props.onExport} className="px-1 py-1 text-xs text-cyan-100/80">{props.copy.placesExport}</button>
        <button type="button" onClick={() => input.current?.click()} className="px-1 py-1 text-xs text-cyan-100/80">{props.copy.placesImport}</button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file) return
            void file.text().then((raw) => {
              const incoming = readPlacesFile(raw)
              if (!incoming.ok) {
                setImportFault(true)
                return
              }
              setImportFault(false)
              props.onImport(incoming.places)
            }).catch(() => setImportFault(true))
          }}
        />
      </div>
      {importFault ? <p className="px-1 text-xs text-[#FF5D73]">{props.copy.placesImportFailed}</p> : null}
    </div>
  )
}

function downloadPlaces(places: readonly Favourite[]): void {
  const href = URL.createObjectURL(new Blob([placesFile(places)], { type: "application/json" }))
  const link = document.createElement("a")
  link.href = href
  link.download = "hk-traffic-places.json"
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(href), 5000)
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
