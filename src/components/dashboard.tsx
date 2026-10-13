"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useSearchParams } from "next/navigation"
import { CityMap } from "@/components/city-map"
import { LayerDock } from "@/components/layer-dock"
import { OpsHud } from "@/components/ops-hud"
import { useLiveJson } from "@/components/use-live-json"
import { useI18n } from "@/components/locale"
import { decorateControlPoints } from "@/lib/control-points"
import { kmbListFollowMs } from "@/lib/list-wait"
import { PLACE_POLL_MS, placePinZoom } from "@/lib/kmb-view"
import { PARKING_POLL_MS, type ParkReadingResponse } from "@/lib/parking"
import { KERB_POLL_MS, type KerbPlacesResponse } from "@/lib/kerb"
import { METER_POLL_MS, type MeterPlacesResponse } from "@/lib/meter-poles"
import type { ChargerPlacesResponse } from "@/lib/ev-chargers"
import { CHARGER_POLL_MS } from "@/lib/epd-chargers"
import { inLantau } from "@/lib/lantau"
import { CAMERA_LAYER_MS, WORKS_LAYER_MS } from "@/lib/picture"
import { mergePicture } from "@/lib/picture-join"
import { SPEED_CAM_POLL_MS, type SpeedCamResponse } from "@/lib/speed-cam"
import { boardFaultSnapshot, subscribeBoardFaults } from "@/lib/board-status"
import { catalogueBoards } from "@/lib/place-arrivals"
import { layersForIntel } from "@/lib/intel-focus"
import { INTEL_PHONE_QUERY, intelCardOpen, preferenceServerSnapshot, preferenceSnapshot, soleLayer, subscribePreferences, updatePreference } from "@/lib/preferences"
import { hkoLang } from "@/lib/i18n"
import { shareAddress, siteAddress } from "@/lib/share-link"
import { nextRoads } from "@/lib/traffic-join"
import type {
  ApproachesResponse,
  CitybusPlacesResponse,
  ControlPointsResponse,
  FerryResponse,
  GmbPlacesResponse,
  IncidentsResponse,
  KmbPlacesResponse,
  LrtResponse,
  MtrResponse,
  NlbPlacesResponse,
  PictureResponse,
  TrafficResponse,
  TrafficSpeedReading,
  WarningsResponse,
  WatchLayer,
  WatchLayers,
  Basemap,
} from "@/lib/types"

function liveError(error: string | null, body: { ok: boolean; error?: string } | null, fallback: string): string | null {
  if (error) return error
  if (!body) return null
  return body.error ?? (body.ok ? null : fallback)
}

export function Dashboard() {
  const { locale, messages: m } = useI18n()
  const search = useSearchParams()
  const forceDown = search.get("feed") === "down"
  const mapDown = search.get("map") === "down"
  const prefs = useSyncExternalStore(subscribePreferences, preferenceSnapshot, preferenceServerSnapshot)
  const phone = useSyncExternalStore(subscribeIntelPhone, intelPhoneNow, () => false)
  const [flyToken, setFlyToken] = useState(0)
  const [mapLive, setMapLive] = useState(!mapDown)
  const layers = prefs.layers
  const basemap = prefs.basemap
  const [roadShape, setRoadShape] = useState<"full" | "speeds">("full")
  const [roads, setRoads] = useState<TrafficResponse | null>(null)
  const roadsRef = useRef(roads)
  const roadShapeRef = useRef(roadShape)
  roadsRef.current = roads
  roadShapeRef.current = roadShape
  const trafficUrl = forceDown
    ? "/api/traffic?simulate=fail"
    : roadShape === "speeds"
      ? "/api/traffic?shape=speeds"
      : "/api/traffic"
  const trafficLive = useLiveJson<TrafficResponse | TrafficSpeedReading>(trafficUrl)
  useEffect(() => {
    const incoming = trafficLive.data
    if (!incoming) return
    const next = nextRoads(roadsRef.current, incoming)
    setRoads(next.roads)
    if (next.shape !== roadShapeRef.current) setRoadShape(next.shape)
  }, [trafficLive.data])
  const approachesLive = useLiveJson<ApproachesResponse>("/api/approaches")
  const cameraLive = useLiveJson<PictureResponse>("/api/picture?part=cameras", CAMERA_LAYER_MS)
  const worksLive = useLiveJson<PictureResponse>("/api/picture?part=works", WORKS_LAYER_MS)
  const speedCamLive = useLiveJson<SpeedCamResponse>("/api/speed-cam", SPEED_CAM_POLL_MS)
  const incidentsLive = useLiveJson<IncidentsResponse>("/api/incidents")
  const controlLive = useLiveJson<ControlPointsResponse>("/api/control-points")
  const warningsLive = useLiveJson<WarningsResponse>(`/api/warnings?lang=${hkoLang(locale)}`)
  const [view, setView] = useState<{ lng: number; lat: number; zoom: number } | null>(null)
  const sole = soleLayer(layers)
  const kmbQuery =
    view && view.zoom >= placePinZoom("kmb", sole, basemap)
      ? `lng=${view.lng.toFixed(3)}&lat=${view.lat.toFixed(3)}&zoom=${view.zoom.toFixed(2)}`
      : null
  const citybusQuery =
    view && view.zoom >= placePinZoom("citybus", sole, basemap)
      ? `lng=${view.lng.toFixed(3)}&lat=${view.lat.toFixed(3)}&zoom=${view.zoom.toFixed(2)}`
      : null
  const kmbPlacesUrl = layers.kmb && kmbQuery ? `/api/kmb/places?${kmbQuery}${sole === "kmb" ? "&wide=1" : ""}` : null
  const citybusPlacesUrl = layers.citybus && citybusQuery ? `/api/citybus/places?${citybusQuery}${sole === "citybus" ? "&wide=1" : ""}` : null
  const gmbQuery =
    view && view.zoom >= placePinZoom("gmb", sole, basemap)
      ? `lng=${view.lng.toFixed(3)}&lat=${view.lat.toFixed(3)}&zoom=${view.zoom.toFixed(2)}`
      : null
  const gmbPlacesUrl = layers.gmb && gmbQuery ? `/api/gmb/places?${gmbQuery}${sole === "gmb" ? "&wide=1" : ""}` : null
  const nlbQuery =
    view && view.zoom >= placePinZoom("nlb", sole, basemap) && (sole === "nlb" || inLantau(view.lng, view.lat))
      ? `lng=${view.lng.toFixed(3)}&lat=${view.lat.toFixed(3)}&zoom=${view.zoom.toFixed(2)}${sole === "nlb" ? "&wide=1" : ""}`
      : null
  const nlbPlacesUrl = layers.nlb && nlbQuery ? `/api/nlb/places?${nlbQuery}` : null
  const mtrBusQuery =
    view && view.zoom >= placePinZoom("mtrbus", sole, basemap)
      ? `lng=${view.lng.toFixed(3)}&lat=${view.lat.toFixed(3)}&zoom=${view.zoom.toFixed(2)}`
      : null
  const mtrBusPlacesUrl = layers.mtrbus && mtrBusQuery ? `/api/mtr-bus/places?${mtrBusQuery}${sole === "mtrbus" ? "&wide=1" : ""}` : null
  const parkWide = sole === "parking" || sole === "motorcycle"
  const parkFloors = [
    ...(layers.parking ? [placePinZoom("parking", sole, basemap)] : []),
    ...(layers.motorcycle ? [placePinZoom("motorcycle", sole, basemap)] : []),
  ]
  const parkPlacesUrl =
    parkFloors.length > 0 && view && view.zoom >= Math.min(...parkFloors)
      ? `/api/parking/places?lng=${view.lng.toFixed(3)}&lat=${view.lat.toFixed(3)}&zoom=${view.zoom.toFixed(2)}${parkWide ? "&wide=1" : ""}`
      : null
  const meterWide = sole === "meter"
  const meterPlacesUrl =
    layers.meter && view && view.zoom >= placePinZoom("meter", sole, basemap)
      ? `/api/meters/places?lng=${view.lng.toFixed(3)}&lat=${view.lat.toFixed(3)}&zoom=${view.zoom.toFixed(2)}${meterWide ? "&wide=1" : ""}`
      : null
  const chargerWide = sole === "charger"
  const chargerPlacesUrl =
    layers.charger && view && view.zoom >= placePinZoom("charger", sole, basemap)
      ? `/api/chargers/places?lng=${view.lng.toFixed(3)}&lat=${view.lat.toFixed(3)}&zoom=${view.zoom.toFixed(2)}${chargerWide ? "&wide=1" : ""}`
      : null
  const mtrLive = useLiveJson<MtrResponse>("/api/mtr", 15_000)
  const mtrStationsLive = useLiveJson<{ ok: boolean; listReady?: boolean; stations: { code: string; en: string; tc: string; lng: number; lat: number }[] }>(
    layers.mtr ? "/api/mtr/stations" : null,
    PLACE_POLL_MS,
    false,
    kmbListFollowMs,
  )
  const kmbPlacesLive = useLiveJson<KmbPlacesResponse>(kmbPlacesUrl, PLACE_POLL_MS, false, kmbListFollowMs)
  const lrtLive = useLiveJson<LrtResponse>(layers.lrt ? "/api/lrt" : null, 15_000)
  const citybusPlacesLive = useLiveJson<CitybusPlacesResponse>(citybusPlacesUrl, PLACE_POLL_MS, false, kmbListFollowMs)
  const gmbPlacesLive = useLiveJson<GmbPlacesResponse>(gmbPlacesUrl, PLACE_POLL_MS)
  const nlbPlacesLive = useLiveJson<NlbPlacesResponse>(nlbPlacesUrl, PLACE_POLL_MS, false, kmbListFollowMs)
  const mtrBusPlacesLive = useLiveJson<CitybusPlacesResponse>(mtrBusPlacesUrl, PLACE_POLL_MS)
  const ferryLive = useLiveJson<FerryResponse>(layers.ferry ? "/api/ferry" : null, 60_000)
  const parkPlacesLive = useLiveJson<ParkReadingResponse>(parkPlacesUrl, PARKING_POLL_MS)
  const kerbWide = sole === "kerb"
  const kerbPlacesUrl =
    layers.kerb && view && view.zoom >= placePinZoom("kerb", sole, basemap)
      ? `/api/kerb/places?lng=${view.lng.toFixed(3)}&lat=${view.lat.toFixed(3)}&zoom=${view.zoom.toFixed(2)}${kerbWide ? "&wide=1" : ""}`
      : null
  const kerbPlacesLive = useLiveJson<KerbPlacesResponse>(kerbPlacesUrl, KERB_POLL_MS)
  const meterPlacesLive = useLiveJson<MeterPlacesResponse>(meterPlacesUrl, METER_POLL_MS)
  const chargerPlacesLive = useLiveJson<ChargerPlacesResponse>(chargerPlacesUrl, CHARGER_POLL_MS)
  const traffic = roads
  const approaches = approachesLive.data
  const picture = mergePicture(cameraLive.data, worksLive.data)
  const incidents = incidentsLive.data
  const controlPoints = controlLive.data
  const warnings = warningsLive.data
  const mtr = mtrLive.data
  const kmb = catalogueBoards(kmbPlacesLive.data)
  const lrt = lrtLive.data
  const citybus = catalogueBoards(citybusPlacesLive.data)
  const gmb = catalogueBoards(gmbPlacesLive.data)
  const nlb = catalogueBoards(nlbPlacesLive.data)
  const mtrBus = catalogueBoards(mtrBusPlacesLive.data)
  const ferry = ferryLive.data
  const trafficLoading = roads === null && trafficLive.error === null
  const trafficError = trafficLive.error ?? (traffic && !traffic.ok ? traffic.error ?? "Speed feed failed" : null)
  const pictureError = cameraLive.error ?? worksLive.error ?? picture?.error ?? (picture && !picture.ok ? "Picture failed" : null)
  const [focus, setFocus] = useState<{ id: string; coordinates: [number, number]; zoom?: number } | null>(null)
  const [only, setOnly] = useState(false)
  const intelChoice = prefs.intelOpen
  const intelOpen = intelCardOpen(phone, intelChoice)
  const boardFaults = useSyncExternalStore(subscribeBoardFaults, boardFaultSnapshot, boardFaultSnapshot)

  const corridors = traffic?.ok ? traffic.corridors : []
  const boundary = controlPoints?.ok ? decorateControlPoints(controlPoints.points, corridors) : null

  function setLayers(next: WatchLayers) {
    updatePreference({ layers: next })
  }

  function focusIntel(next: { id: string; coordinates: [number, number]; layer: WatchLayer | null; zoom?: number }) {
    setFocus({ id: next.id, coordinates: next.coordinates, zoom: next.zoom })
    const opened = layersForIntel(next.layer, layers, only)
    if (opened.only !== only) setOnly(opened.only)
    if (opened.layers !== layers) setLayers(opened.layers)
  }

  function selectBasemap(next: Basemap) {
    if (next === "buildings") {
      updatePreference((current) => ({ basemap: current.basemap === "buildings" ? current.ground : "buildings" }))
      return
    }
    updatePreference({ basemap: next, ground: next })
  }

  return (
    <main className="relative h-dvh overflow-hidden bg-[#061018]">
      <CityMap
        corridors={corridors}
        approaches={approaches?.ok ? approaches.points : []}
        picture={picture}
        speedCams={speedCamLive.data?.ok ? speedCamLive.data.cameras : null}
        incidents={incidents?.ok ? incidents.incidents : null}
        controlPoints={boundary}
        mtr={mtr?.ok ? mtr : null}
        mtrStations={mtrStationsLive.data?.ok ? mtrStationsLive.data.stations : null}
        kmb={kmb}
        lrt={lrt?.ok ? lrt : null}
        citybus={citybus}
        gmb={gmb}
        nlb={nlb}
        mtrBus={mtrBus}
        ferry={ferry?.ok ? ferry : null}
        parking={layers.parking && parkPlacesLive.data?.ok ? parkPlacesLive.data.parks : null}
        motorcycles={layers.motorcycle && parkPlacesLive.data?.ok ? parkPlacesLive.data.motorcycles : null}
        kerbs={kerbPlacesLive.data?.ok ? kerbPlacesLive.data.rows : null}
        meters={meterPlacesLive.data?.ok ? meterPlacesLive.data.poles : null}
        chargers={chargerPlacesLive.data?.ok ? chargerPlacesLive.data.places : null}
        onView={setView}
        layers={layers}
        basemap={basemap}
        flyToken={flyToken}
        focus={focus}
        disabled={mapDown}
        onMap={setMapLive}
      />
      <OpsHud
        traffic={traffic}
        trafficLoading={trafficLoading}
        trafficError={trafficError}
        approaches={approaches}
        incidents={incidents?.ok ? incidents.incidents : null}
        incidentsError={incidentsLive.error ?? (incidents && !incidents.ok ? incidents.error ?? "Special traffic news failed." : null)}
        works={picture?.works ?? null}
        controlPoints={boundary}
        controlError={controlLive.error ?? (controlPoints && !controlPoints.ok ? controlPoints.error ?? "Control point waiting times failed." : null)}
        warnings={warnings?.warnings ?? []}
        warningsReady={warnings != null || warningsLive.error != null}
        warningsError={warningsLive.error ?? warnings?.error ?? null}
        conditions={warnings?.conditions ?? null}
        approachesError={approachesLive.error ?? (approaches && !approaches.ok ? approaches.error ?? "Crossing approaches failed." : null)}
        mapLive={mapLive}
        pictureError={pictureError}
        mtrError={mtrLive.error ?? (mtr && !mtr.ok ? mtr.error ?? "Next train feed failed" : null)}
        kmbError={liveError(kmbPlacesLive.error, kmbPlacesLive.data, "KMB stops failed")}
        lrtError={lrtLive.error ?? (lrt && !lrt.ok ? lrt.error ?? "Light Rail arrivals failed" : null)}
        citybusError={liveError(citybusPlacesLive.error, citybusPlacesLive.data, "Citybus stops failed")}
        gmbError={liveError(gmbPlacesLive.error, gmbPlacesLive.data, "Green minibus stops failed")}
        nlbError={liveError(nlbPlacesLive.error, nlbPlacesLive.data, "New Lantao Bus stops failed")}
        mtrBusError={liveError(mtrBusPlacesLive.error, mtrBusPlacesLive.data, "MTR bus stops failed")}
        ferryError={liveError(ferryLive.error, ferryLive.data, "Ferry arrivals failed")}
        boardFaults={boardFaults}
        open={intelOpen}
        choice={intelChoice}
        onOpenChange={(open) => updatePreference({ intelOpen: open, intelChosen: true })}
        onFocus={focusIntel}
        view={view}
      />
      <p
        data-map-chrome="bottom"
        className="pointer-events-auto absolute bottom-1 left-2 z-30 max-w-[calc(100%-1rem)] bg-[#041018]/92 px-2 py-1 font-[family-name:var(--font-hud)] text-[0.72rem] leading-snug text-white sm:bottom-[0.4rem] sm:left-3 sm:max-w-[min(22rem,calc(100%-26rem))] sm:whitespace-nowrap"
      >
        {m.creditBy}{" "}
        <a
          href="https://www.linkedin.com/in/keithlihk"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-100 underline decoration-cyan-200/60 underline-offset-2"
        >
          {m.creditLinkedIn}
        </a>
        {" / "}
        <a
          href="https://github.com/keithligh"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-100 underline decoration-cyan-200/60 underline-offset-2"
        >
          {m.creditGitHub}
        </a>
        {" / "}
        <ShareSite label={m.share} copiedLabel={m.shared} title={m.productName} />
      </p>
      <LayerDock
        layers={layers}
        only={only}
        onOnly={setOnly}
        basemap={basemap}
        counts={{
          speed: null,
          cameras: null,
          speedcam: speedCamLive.data?.ok ? speedCamLive.data.cameras.features.length : null,
          works: picture ? picture.works.features.length : null,
          tolls: null,
          incidents: incidents ? incidents.incidents.features.length : null,
          mtr: null,
          kmb: null,
          lrt: null,
          citybus: null,
          gmb: null,
          nlb: null,
          mtrbus: null,
          ferry: null,
          parking: null,
          motorcycle: null,
          kerb: null,
          meter: null,
          charger: null,
          control: null,
        }}
        onSetLayers={setLayers}
        onBasemap={selectBasemap}
        onReplay={() => setFlyToken((value) => value + 1)}
        mapLive={mapLive}
        pictureError={pictureError}
        speedCamError={speedCamLive.error ?? (speedCamLive.data && !speedCamLive.data.ok ? speedCamLive.data.error ?? "Speed cams did not load." : null)}
        mtrError={mtrLive.error ?? (mtr && !mtr.ok ? mtr.error ?? "Next train feed failed" : null)}
        kmbError={liveError(kmbPlacesLive.error, kmbPlacesLive.data, "KMB stops failed")}
        lrtError={lrtLive.error ?? (lrt && !lrt.ok ? lrt.error ?? "Light Rail arrivals failed" : null)}
        citybusError={liveError(citybusPlacesLive.error, citybusPlacesLive.data, "Citybus stops failed")}
        gmbError={liveError(gmbPlacesLive.error, gmbPlacesLive.data, "Green minibus stops failed")}
        nlbError={liveError(nlbPlacesLive.error, nlbPlacesLive.data, "New Lantao Bus stops failed")}
        mtrBusError={liveError(mtrBusPlacesLive.error, mtrBusPlacesLive.data, "MTR bus stops failed")}
        ferryError={liveError(ferryLive.error, ferryLive.data, "Ferry arrivals failed")}
        parkingError={layers.parking ? liveError(parkPlacesLive.error, parkPlacesLive.data, "Parking catalogue failed") : null}
        motorcycleError={layers.motorcycle ? liveError(parkPlacesLive.error, parkPlacesLive.data, "Motorcycle parks failed") : null}
        kerbError={liveError(kerbPlacesLive.error, kerbPlacesLive.data, "Motorcycle bays failed")}
        meterError={liveError(meterPlacesLive.error, meterPlacesLive.data, "Meter catalogue failed")}
        chargerError={liveError(chargerPlacesLive.error, chargerPlacesLive.data, "Charger catalogue failed")}
        aboveMarquee={!intelOpen}
      />
    </main>
  )
}

function subscribeIntelPhone(onChange: () => void) {
  const query = window.matchMedia(INTEL_PHONE_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function intelPhoneNow(): boolean {
  return window.matchMedia(INTEL_PHONE_QUERY).matches
}

function ShareSite(props: { label: string; copiedLabel: string; title: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      aria-live="polite"
      onClick={() => {
        const url = siteAddress(window.location.href)
        const share = typeof navigator.share === "function" ? navigator.share.bind(navigator) : undefined
        const copy = typeof navigator.clipboard?.writeText === "function" ? (value: string) => navigator.clipboard.writeText(value) : undefined
        void shareAddress(url, props.title, { share, copy }).then((result) => {
          if (result === "copied") setCopied(true)
        })
      }}
      className="text-cyan-100 underline decoration-cyan-200/60 underline-offset-2"
    >
      {copied ? props.copiedLabel : props.label}
    </button>
  )
}
