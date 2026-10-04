"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { BriefingCard } from "@/components/briefing-card"
import { CityMap } from "@/components/city-map"
import { LayerDock } from "@/components/layer-dock"
import { OpsHud } from "@/components/ops-hud"
import { useLiveJson } from "@/components/use-live-json"
import { useI18n } from "@/components/locale"
import { decorateControlPoints } from "@/lib/control-points"
import { GMB_MIN_ZOOM, KMB_MIN_ZOOM, KMB_POLL_MS, PLACE_POLL_MS } from "@/lib/kmb-view"
import { inLantau } from "@/lib/lantau"
import { PICTURE_POLL_MS } from "@/lib/picture"
import { mergePlaceArrivals } from "@/lib/place-arrivals"
import { hkoLang } from "@/lib/i18n"
import type {
  ApproachesResponse,
  CitybusPlacesResponse,
  CitybusResponse,
  ControlPointsResponse,
  FerryResponse,
  GmbPlacesResponse,
  GmbResponse,
  IncidentsResponse,
  KmbPlacesResponse,
  KmbResponse,
  LrtResponse,
  MtrResponse,
  NlbPlacesResponse,
  NlbResponse,
  PictureResponse,
  TrafficResponse,
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

const LAYERS_ON: WatchLayers = {
  speed: true,
  cameras: true,
  works: true,
  tolls: true,
  incidents: true,
  control: true,
  mtr: true,
  lrt: true,
  kmb: true,
  citybus: true,
  gmb: true,
  nlb: true,
  ferry: true,
}

export function Dashboard() {
  const { locale, messages: m } = useI18n()
  const search = useSearchParams()
  const forceDown = search.get("feed") === "down"
  const mapDown = search.get("map") === "down"
  const [flyToken, setFlyToken] = useState(0)
  const [mapLive, setMapLive] = useState(!mapDown)
  const [layers, setLayers] = useState<WatchLayers>(LAYERS_ON)
  const [basemap, setBasemap] = useState<Basemap>("satellite")
  const [ground, setGround] = useState<Exclude<Basemap, "buildings">>("satellite")
  const trafficLive = useLiveJson<TrafficResponse>(forceDown ? "/api/traffic?simulate=fail" : "/api/traffic")
  const approachesLive = useLiveJson<ApproachesResponse>("/api/approaches")
  const pictureLive = useLiveJson<PictureResponse>("/api/picture", PICTURE_POLL_MS)
  const incidentsLive = useLiveJson<IncidentsResponse>("/api/incidents")
  const controlLive = useLiveJson<ControlPointsResponse>("/api/control-points")
  const warningsLive = useLiveJson<WarningsResponse>(`/api/warnings?lang=${hkoLang(locale)}`)
  const [view, setView] = useState<{ lng: number; lat: number; zoom: number } | null>(null)
  const kmbQuery =
    view && view.zoom >= KMB_MIN_ZOOM
      ? `lng=${view.lng.toFixed(3)}&lat=${view.lat.toFixed(3)}&zoom=${view.zoom.toFixed(2)}`
      : null
  const citybusQuery =
    view && view.zoom >= KMB_MIN_ZOOM
      ? `lng=${view.lng.toFixed(3)}&lat=${view.lat.toFixed(3)}`
      : null
  const kmbPlacesUrl = layers.kmb && kmbQuery ? `/api/kmb/places?${kmbQuery}` : null
  const kmbUrl = layers.kmb && kmbQuery ? `/api/kmb?${kmbQuery}` : null
  const citybusPlacesUrl = layers.citybus && citybusQuery ? `/api/citybus/places?${citybusQuery}` : null
  const citybusUrl = layers.citybus && citybusQuery ? `/api/citybus?${citybusQuery}` : null
  const gmbQuery =
    view && view.zoom >= GMB_MIN_ZOOM
      ? `lng=${view.lng.toFixed(3)}&lat=${view.lat.toFixed(3)}&zoom=${view.zoom.toFixed(2)}`
      : null
  const gmbPlacesUrl = layers.gmb && gmbQuery ? `/api/gmb/places?${gmbQuery}` : null
  const gmbUrl = layers.gmb && gmbQuery ? `/api/gmb?${gmbQuery}` : null
  const nlbQuery =
    view && view.zoom >= KMB_MIN_ZOOM && inLantau(view.lng, view.lat)
      ? `lng=${view.lng.toFixed(3)}&lat=${view.lat.toFixed(3)}`
      : null
  const nlbPlacesUrl = layers.nlb && nlbQuery ? `/api/nlb/places?${nlbQuery}` : null
  const nlbUrl = layers.nlb && nlbQuery ? `/api/nlb?${nlbQuery}` : null
  const mtrLive = useLiveJson<MtrResponse>("/api/mtr", 15_000)
  const kmbPlacesLive = useLiveJson<KmbPlacesResponse>(kmbPlacesUrl, PLACE_POLL_MS)
  const kmbLive = useLiveJson<KmbResponse>(kmbUrl, KMB_POLL_MS, true)
  const lrtLive = useLiveJson<LrtResponse>(layers.lrt ? "/api/lrt" : null, 15_000)
  const citybusPlacesLive = useLiveJson<CitybusPlacesResponse>(citybusPlacesUrl, PLACE_POLL_MS)
  const citybusLive = useLiveJson<CitybusResponse>(citybusUrl, 60_000, true)
  const gmbPlacesLive = useLiveJson<GmbPlacesResponse>(gmbPlacesUrl, PLACE_POLL_MS)
  const gmbLive = useLiveJson<GmbResponse>(gmbUrl, KMB_POLL_MS, true)
  const nlbPlacesLive = useLiveJson<NlbPlacesResponse>(nlbPlacesUrl, PLACE_POLL_MS)
  const nlbLive = useLiveJson<NlbResponse>(nlbUrl, 60_000, true)
  const ferryLive = useLiveJson<FerryResponse>(layers.ferry ? "/api/ferry" : null, 60_000, true)
  const kmbMerged = useMemo(
    () => mergePlaceArrivals(kmbPlacesLive.data, kmbLive.data),
    [kmbLive.data, kmbPlacesLive.data],
  )
  const citybusMerged = useMemo(
    () => mergePlaceArrivals(citybusPlacesLive.data, citybusLive.data),
    [citybusLive.data, citybusPlacesLive.data],
  )
  const gmbMerged = useMemo(
    () => mergePlaceArrivals(gmbPlacesLive.data, gmbLive.data),
    [gmbLive.data, gmbPlacesLive.data],
  )
  const nlbMerged = useMemo(
    () => mergePlaceArrivals(nlbPlacesLive.data, nlbLive.data),
    [nlbLive.data, nlbPlacesLive.data],
  )
  const traffic = trafficLive.data
  const approaches = approachesLive.data
  const picture = pictureLive.data
  const incidents = incidentsLive.data
  const controlPoints = controlLive.data
  const warnings = warningsLive.data
  const mtr = mtrLive.data
  const kmb = kmbMerged
  const lrt = lrtLive.data
  const citybus = citybusMerged
  const gmb = gmbMerged
  const nlb = nlbMerged
  const ferry = ferryLive.data
  const trafficLoading = traffic === null && trafficLive.error === null
  const trafficError = trafficLive.error ?? (traffic && !traffic.ok ? traffic.error ?? "Speed feed failed" : null)
  const pictureError = pictureLive.error ?? picture?.error ?? (picture && !picture.ok ? "Picture failed" : null)
  const [focus, setFocus] = useState<{ id: string; coordinates: [number, number] } | null>(null)
  const [intelOpen, setIntelOpen] = useState(true)

  const corridors = traffic?.ok ? traffic.corridors : []
  const boundary = controlPoints?.ok ? decorateControlPoints(controlPoints.points, corridors) : null

  const toggleLayer = (layer: WatchLayer) => {
    setLayers((current) => ({ ...current, [layer]: !current[layer] }))
  }

  function selectBasemap(next: Basemap) {
    if (next === "buildings") {
      setBasemap((current) => (current === "buildings" ? ground : "buildings"))
      return
    }
    setGround(next)
    setBasemap(next)
  }

  return (
    <main className="relative h-dvh overflow-hidden bg-[#061018]">
      <CityMap
        corridors={corridors}
        approaches={approaches?.ok ? approaches.points : []}
        picture={picture}
        incidents={incidents?.ok ? incidents.incidents : null}
        controlPoints={boundary}
        mtr={mtr?.ok ? mtr : null}
        kmb={kmb}
        lrt={lrt?.ok ? lrt : null}
        citybus={citybus}
        gmb={gmb}
        nlb={nlb}
        ferry={ferry?.ok ? ferry : null}
        onView={setView}
        layers={layers}
        basemap={basemap}
        flyToken={flyToken}
        focus={focus}
        disabled={mapDown}
        onMap={setMapLive}
      />
      <BriefingCard />
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
        kmbError={liveError(kmbLive.error, kmbLive.data, "KMB arrivals failed")}
        lrtError={lrtLive.error ?? (lrt && !lrt.ok ? lrt.error ?? "Light Rail arrivals failed" : null)}
        citybusError={liveError(citybusLive.error, citybusLive.data, "Citybus arrivals failed")}
        gmbError={liveError(gmbLive.error, gmbLive.data, "Green minibus arrivals failed")}
        nlbError={liveError(nlbLive.error, nlbLive.data, "New Lantao Bus arrivals failed")}
        ferryError={liveError(ferryLive.error, ferryLive.data, "Ferry arrivals failed")}
        open={intelOpen}
        onOpenChange={setIntelOpen}
        onFocus={setFocus}
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
      </p>
      <LayerDock
        layers={layers}
        basemap={basemap}
        counts={{
          speed: null,
          cameras: null,
          works: picture ? picture.works.features.length : null,
          tolls: null,
          incidents: incidents ? incidents.incidents.features.length : null,
          mtr: null,
          kmb: null,
          lrt: null,
          citybus: null,
          gmb: null,
          nlb: null,
          ferry: null,
          control: null,
        }}
        onToggle={toggleLayer}
        onBasemap={selectBasemap}
        onReplay={() => setFlyToken((value) => value + 1)}
        mapLive={mapLive}
        pictureError={pictureError}
        mtrError={mtrLive.error ?? (mtr && !mtr.ok ? mtr.error ?? "Next train feed failed" : null)}
        kmbError={liveError(kmbLive.error, kmbLive.data, "KMB arrivals failed")}
        lrtError={lrtLive.error ?? (lrt && !lrt.ok ? lrt.error ?? "Light Rail arrivals failed" : null)}
        citybusError={liveError(citybusLive.error, citybusLive.data, "Citybus arrivals failed")}
        gmbError={liveError(gmbLive.error, gmbLive.data, "Green minibus arrivals failed")}
        nlbError={liveError(nlbLive.error, nlbLive.data, "New Lantao Bus arrivals failed")}
        ferryError={liveError(ferryLive.error, ferryLive.data, "Ferry arrivals failed")}
        aboveMarquee={!intelOpen}
      />
    </main>
  )
}
