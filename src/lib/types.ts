export type SpeedBand = "free" | "slow" | "congested" | "unknown"

export type Corridor = {
  id: string
  roadTc: string
  roadEn: string
  direction: string
  speedKmh: number | null
  band: SpeedBand
  lengthKm: number
  detectorCount: number
  coordinates: [number, number][]
}

export type SpeedSummary = {
  corridorCount: number
  detectorCount: number
  meanSpeedKmh: number | null
  free: number
  slow: number
  congested: number
  unknown: number
}

export type SegmentSummary = {
  ok: boolean
  error?: string
  observedAt: string | null
  validCount: number
  invalidCount: number
  meanSpeedKmh: number | null
}

export type NetworkStatus = {
  ok: boolean
  error?: string
  revisionDate: string | null
  usedOnMap: boolean
  reason: string
}

export type TrafficResponse = {
  ok: boolean
  error?: string
  observedAt: string | null
  corridors: Corridor[]
  summary: SpeedSummary
  segments: SegmentSummary
  network: NetworkStatus
}

export type CorridorSpeed = {
  id: string
  speedKmh: number | null
  band: SpeedBand
}

export type TrafficSpeedReading = {
  shape: "speeds"
  ok: boolean
  error?: string
  observedAt: string | null
  summary: SpeedSummary
  segments: SegmentSummary
  network: NetworkStatus
  speeds: CorridorSpeed[]
}

export type HarbourJourney = {
  from: string
  to: string
  minutes: number | null
  colour: "red" | "amber" | "green" | "none"
  note: string | null
}

export type ApproachLeg = {
  code: string
  name: string
  nameTc: string
  minutes: number | null
  colour: HarbourJourney["colour"]
}

export type ApproachPoint = {
  id: string
  name: string
  nameTc: string
  coordinates: [number, number]
  legs: ApproachLeg[]
}

export type ApproachesResponse = {
  ok: boolean
  error?: string
  capturedAt: string | null
  points: ApproachPoint[]
}

export type PictureResponse = {
  ok: boolean
  error?: string
  cameras: GeoJSON.FeatureCollection
  works: GeoJSON.FeatureCollection
  tolls: GeoJSON.FeatureCollection
}

export type IncidentsResponse = {
  ok: boolean
  error?: string
  observedAt: string | null
  incidents: GeoJSON.FeatureCollection
}

export type ControlPointsResponse = {
  ok: boolean
  error?: string
  observedAt: string | null
  points: GeoJSON.FeatureCollection
}

export type WeatherWarning = {
  id: string
  code: string
  name: string
  shortName: string
  detail: string
  tone: "red" | "amber"
  urgent: boolean
  score: number
}

export type WeatherConditions = {
  temperatureC: number | null
  rainfallMm: number | null
  rainfallPlace: string
}

export type WarningsResponse = {
  ok: boolean
  error?: string
  observedAt: string | null
  warnings: WeatherWarning[]
  conditions: WeatherConditions
}

export type MtrTimeType = "A" | "D"

export type MtrTrain = {
  id: string
  line: string
  dest: string
  plat: string
  ttnt: number
  observedAt: string
  delay: boolean
  timeType: MtrTimeType
  anchor: string
  path: string[]
  hold: string[]
}

export type MtrCalling = {
  dest: string
  plat: string
  ttnt: number
  delay: boolean
  timeType: MtrTimeType
}

export type MtrBoard = {
  line: string
  station: string
  message: string
  trains: MtrCalling[]
}

export type MtrResponse = {
  ok: boolean
  error?: string
  observedAt: string | null
  trains: MtrTrain[]
  boards: MtrBoard[]
}

export type KmbCall = {
  route: string
  destTc: string
  destEn: string
  eta: string
  minutes: number | null
  scheduled: boolean
  remarkTc: string
  remarkEn: string
  company: "KMB" | "LWB"
}

export type ArrivalClock = "ready" | "waiting"

export type KmbStopBoard = {
  id: string
  nameTc: string
  nameEn: string
  lng: number
  lat: number
  routes: string[]
  calls: KmbCall[]
  clock: ArrivalClock
}

export type KmbPlacesResponse = {
  ok: boolean
  error?: string
  stops: Omit<KmbStopBoard, "calls" | "clock">[]
  // False while the published stop list is still being read. A later answer fills in a new pole.
  listReady?: boolean
}

export type KmbResponse = {
  ok: boolean
  error?: string
  observedAt: string | null
  stops: KmbStopBoard[]
  cacheable?: boolean
}

export type LrtCalling = {
  route: string
  dest: string
  destTc: string
  destEn: string
  ttnt: number
  timeType: "A" | "D"
  plat: string
}

export type LrtBoard = {
  station: string
  calls: LrtCalling[]
}

export type LrtResponse = {
  ok: boolean
  error?: string
  observedAt: string | null
  trains: MtrTrain[]
  boards: LrtBoard[]
}

export type CitybusCall = {
  route: string
  destTc: string
  destEn: string
  eta: string
  minutes: number | null
  scheduled: boolean
  remarkTc: string
  remarkEn: string
}

export type CitybusStopBoard = {
  id: string
  nameTc: string
  nameEn: string
  lng: number
  lat: number
  routes: string[]
  calls: CitybusCall[]
  clock: ArrivalClock
}

export type CitybusPlacesResponse = {
  ok: boolean
  error?: string
  stops: Omit<CitybusStopBoard, "calls" | "clock">[]
  listReady?: boolean
  refreshing?: boolean
}

export type CitybusResponse = {
  ok: boolean
  error?: string
  observedAt: string | null
  stops: CitybusStopBoard[]
  cacheable?: boolean
}

export type GmbCall = CitybusCall
export type GmbStopBoard = CitybusStopBoard
export type GmbPlacesResponse = CitybusPlacesResponse
export type GmbResponse = CitybusResponse

export type NlbCall = CitybusCall
export type NlbStopBoard = CitybusStopBoard
export type NlbPlacesResponse = CitybusPlacesResponse
export type NlbResponse = CitybusResponse

export type FerryCall = {
  route: string
  destTc: string
  destEn: string
  originTc: string
  originEn: string
  arriving: boolean
  eta: string
  minutes: number | null
  remarkTc: string
  remarkEn: string
  scheduled?: boolean
}

export type FerryPier = {
  id: string
  nameTc: string
  nameEn: string
  lng: number
  lat: number
  calls: FerryCall[]
}

export type FerryVessel = {
  id: string
  nameTc: string
  nameEn: string
  lng: number
  lat: number
  route: string
  eta: string
  minutes: number | null
  destTc?: string
  destEn?: string
  fix: "gps" | "clock"
  fromLng?: number
  fromLat?: number
  toLng?: number
  toLat?: number
  departAt?: number | null
  arriveAt?: number | null
  pathLng?: number[]
  pathLat?: number[]
}

export type FerryResponse = {
  ok: boolean
  error?: string
  observedAt: string | null
  piers: FerryPier[]
  vessels: FerryVessel[]
  cacheable?: boolean
}

export type WatchLayer = "speed" | "cameras" | "speedcam" | "works" | "tolls" | "incidents" | "control" | "mtr" | "kmb" | "lrt" | "citybus" | "gmb" | "nlb" | "mtrbus" | "ferry" | "parking" | "motorcycle" | "kerb" | "meter" | "charger"

export type WatchLayers = Record<WatchLayer, boolean>

export type Basemap = "satellite" | "street" | "buildings"
