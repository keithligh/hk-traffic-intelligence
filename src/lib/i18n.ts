import { isSpeedBand } from "./speed.ts"
import type { SpeedBand } from "@/lib/types"

export type Locale = "zh-HK" | "zh-CN" | "en"

export const DEFAULT_LOCALE: Locale = "zh-HK"

export const LOCALES: Locale[] = ["zh-HK", "zh-CN", "en"]

type Convert = (text: string) => string

let simplified: Convert | null = null
let simplifiedLoad: Promise<Convert> | null = null

export function ensureSimplified(): Promise<Convert> {
  // Loaded only for simplified Chinese so the default Traditional page does not download the converter.
  simplifiedLoad ??= import("opencc-js/t2cn").then(({ Converter }) => {
    const convert = Converter({ from: "hk", to: "cn" })
    simplified = convert
    return convert
  })
  return simplifiedLoad
}

export function localeOf(value: string | undefined | null): Locale {
  if (value === "zh-HK" || value === "zh-CN" || value === "en") return value
  return DEFAULT_LOCALE
}

export function htmlLang(locale: Locale): string {
  return locale
}

export type Messages = {
  locale: Locale
  documentTitle: string
  productMark: string
  productName: string
  live: string
  sync: string
  fault: string
  mapOff: string
  cross: string
  eastern: string
  western: string
  crossFull: string
  easternFull: string
  westernFull: string
  minutes: (n: number) => string
  approachHint: (road: string) => string
  harbourFrom: string
  fromIsland: string
  fromKowloon: string
  followMap: (road: string) => string
  fastestHere: string
  slowerBy: (n: number) => string
  harbourMissing: string
  harbourMissingHint: string
  incident: string
  incidentsOpen: (n: number) => string
  incidentHint: string
  boundary: string
  boundaryHint: string
  weather: string
  weatherHint: string
  network: string
  good: string
  average: string
  bad: string
  ranked: string
  roads: string
  systems: string
  changelog: string
  changelogAdded: string
  changelogFixed: string
  changelogImproved: string
  hide: string
  intel: string
  emptyRanked: string
  emptyRoads: string
  emptyBoundary: string
  emptyWeather: string
  emptySystems: string
  clear: string
  noFeed: string
  veryBusyCount: (n: number) => string
  badApproachCount: (n: number) => string
  busyCount: (n: number) => string
  slowCount: (n: number) => string
  closedCount: (n: number) => string
  hallVeryBusy: string
  hallBadApproach: string
  hallBusy: string
  hallClosed: string
  hallMaintenance: string
  hallSlow: string
  hallNormal: string
  residentArrival: string
  residentDeparture: string
  visitorArrival: string
  visitorDeparture: string
  queueNormalResident: string
  queueNormalVisitor: string
  queueBusyResident: string
  queueBusyVisitor: string
  queueVeryResident: string
  queueVeryVisitor: string
  queueClosed: string
  queueMaintenance: string
  queueNone: string
  passengerNormal: string
  hallsClosed: string
  passengerClearance: string
  vehicles: string
  noVehicleApproach: string
  speedKmh: (n: number) => string
  lengthKm: (n: number) => string
  noReading: string
  works: string
  worksLive: string
  worksPrep: string
  crossing: string
  conditions: string
  observatoryTemp: (n: number) => string
  noRain: string
  rainHour: (place: string, mm: number) => string
  dry: string
  faultSpeed: string
  faultIncidents: string
  faultCrossings: string
  faultBoundary: string
  faultWeather: string
  language: string
  creditBy: string
  creditLinkedIn: string
  creditGitHub: string
  share: string
  shared: string
  satellite: string
  streets: string
  buildings: string
  speedLayer: string
  cameras: string
  worksLayer: string
  tolls: string
  incidentsLayer: string
  replay: string
  locate: string
  layerOnly: string
  layerAll: string
  layerNames: string
  layerHide: string
  basemap: string
  speedKey: string
  pictureFailed: string
  mapFailed: string
  snapshotFailed: string
  near: (place: string) => string
  facing: (direction: string) => string
  facingLabel: string
  towards: (name: string) => string
  fromPlace: (name: string) => string
  boundLabel: string
  laneLabel: string
  classLabel: string
  statusLabel: string
  districtLabel: string
  regionLabel: string
  referenceLabel: string
  announcedLabel: string
  whenLabel: string
  tunnel: string
  tunnelPortal: string
  controlPoint: string
  roadWork: string
  openStreet: string
  satelliteMap: string
  buildingsMap: string
  mtr: string
  mtrFailed: string
  mtrArriving: string
  mtrDelayed: string
  mtrNoTrain: string
  mtrNext: string
  mtrPlatform: string
  mtrPosition: string
  mtrMethod: string
  mtrBetween: (from: string, to: string) => string
  mtrHere: (name: string) => string
  mtrHeld: (name: string) => string
  mtrDeparts: (n: number) => string
  mtrDue: (when: string, platform: string) => string
  kmb: string
  kmbLwb: string
  lwb: string
  kmbFailed: string
  kmbStopsFailed: string
  kmbScheduled: string
  kmbNone: string
  boardLoading: string
  lrt: string
  lrtFailed: string
  lrtNone: string
  lrtArriving: string
  citybus: string
  citybusFailed: string
  citybusStopsFailed: string
  citybusNone: string
  gmb: string
  gmbFailed: string
  gmbStopsFailed: string
  gmbNone: string
  nlb: string
  nlbFailed: string
  nlbStopsFailed: string
  nlbNone: string
  mtrBus: string
  mtrBusFailed: string
  mtrBusStopsFailed: string
  mtrBusNone: string
  ferry: string
  ferryFailed: string
  ferryNone: string
  parking: string
  parkingFailed: string
  motorcycleFailed: string
  kerb: string
  kerbFailed: string
  kerbBays: (n: number) => string
  parkingNone: string
  parkingUnpublished: string
  parkingClosed: string
  parkingEv: string
  parkingPrivate: string
  parkingLgv: string
  parkingHgv: string
  parkingMotorcycle: string
  parkingSpaces: (n: number) => string
  plateFree: string
  parkingAsOf: (count: string, time: string) => string
  parkingHeight: (n: number) => string
  meter: string
  meterFailed: string
  meterGeneral: string
  meterGoods: string
  meterCoach: string
  meterVacant: string
  meterTaken: string
  meterClosed: string
  meterSince: (state: string, time: string) => string
  charger: string
  chargerFailed: string
  chargerStandard: string
  chargerMedium: string
  chargerQuick: string
  chargerFast: string
  chargerPlugs: (n: number) => string
  chargerList: string
}

const en: Messages = {
  locale: "en",
  documentTitle: "香港智慧城市交通情報網 by Keith Li",
  productMark: "Hong Kong",
  productName: "Traffic Intelligence",
  live: "Live",
  sync: "Sync",
  fault: "Fault",
  mapOff: "map off",
  cross: "Cross",
  eastern: "Eastern",
  western: "Western",
  crossFull: "Cross Harbour",
  easternFull: "Eastern Harbour",
  westernFull: "Western Harbour",
  minutes: (n) => `${n} min`,
  approachHint: (road) => `${road}. Show this approach on the map.`,
  harbourFrom: "From",
  fromIsland: "Hong Kong Island",
  fromKowloon: "Kowloon",
  followMap: (road) => road ? `Nearest sign · ${road}` : "Nearest sign on the map",
  fastestHere: "Fastest of the three tunnels from this sign",
  slowerBy: (n) => `${n} min slower than the fastest`,
  harbourMissing: "n/a",
  harbourMissingHint: "This sign does not publish a time for this tunnel.",
  incident: "Incident",
  incidentsOpen: (n) => (n === 1 ? "1 open" : `${n} open`),
  incidentHint: "Open special traffic news",
  boundary: "Boundary",
  boundaryHint: "Passenger halls at the eight land control points",
  weather: "Weather",
  weatherHint: "Warnings in force, temperature, and rainfall",
  network: "Network",
  good: "Good",
  average: "Average",
  bad: "Bad",
  ranked: "Ranked",
  roads: "Roads",
  systems: "Systems",
  changelog: "Updates",
  changelogAdded: "Added",
  changelogFixed: "Fixed",
  changelogImproved: "Improved",
  hide: "Hide",
  intel: "Intel",
  emptyRanked: "Nothing urgent on the roads, boundary, or weather.",
  emptyRoads: "No open incident, bad road, or works.",
  emptyBoundary: "Waiting for the hall feed.",
  emptyWeather: "Waiting for the Observatory.",
  emptySystems: "Every feed is answering.",
  clear: "Clear",
  noFeed: "No feed",
  veryBusyCount: (n) => (n === 1 ? "1 very busy" : `${n} very busy`),
  badApproachCount: (n) => (n === 1 ? "1 bad approach" : `${n} bad approach`),
  busyCount: (n) => (n === 1 ? "1 busy" : `${n} busy`),
  slowCount: (n) => (n === 1 ? "1 slow" : `${n} slow`),
  closedCount: (n) => (n === 1 ? "1 closed" : `${n} closed`),
  hallVeryBusy: "Very busy",
  hallBadApproach: "Bad approach",
  hallBusy: "Busy",
  hallClosed: "Closed",
  hallMaintenance: "Maintenance",
  hallSlow: "Slow approach",
  hallNormal: "Normal",
  residentArrival: "Resident arrival",
  residentDeparture: "Resident departure",
  visitorArrival: "Visitor arrival",
  visitorDeparture: "Visitor departure",
  queueNormalResident: "Normal, under 15 min",
  queueNormalVisitor: "Normal, under 30 min",
  queueBusyResident: "Busy, under 30 min",
  queueBusyVisitor: "Busy, under 45 min",
  queueVeryResident: "Very busy, 30 min or more",
  queueVeryVisitor: "Very busy, 45 min or more",
  queueClosed: "Closed",
  queueMaintenance: "Maintenance",
  queueNone: "No reading",
  passengerNormal: "Passenger halls normal",
  hallsClosed: "Closed",
  passengerClearance: "Passenger clearance",
  vehicles: "Vehicles",
  noVehicleApproach: "Vehicles: no strategic approach on this feed",
  speedKmh: (n) => `${n} km/h`,
  lengthKm: (n) => `${n.toFixed(1)} km`,
  noReading: "No reading",
  works: "Works",
  worksLive: "In progress",
  worksPrep: "Preparing",
  crossing: "Crossing",
  conditions: "Conditions",
  observatoryTemp: (n) => `${n}°C at the Observatory`,
  noRain: "No rain in the past hour",
  rainHour: (place, mm) => `Past hour ${mm} mm${place ? ` in ${place}` : ""}`,
  dry: "Dry",
  faultSpeed: "Speed picture unavailable",
  faultIncidents: "Incident feed unavailable",
  faultCrossings: "Crossing minutes unavailable",
  faultBoundary: "Hall feed unavailable",
  faultWeather: "Weather warnings unavailable",
  language: "Language",
  creditBy: "Created by: Keith Li -",
  creditLinkedIn: "LinkedIn",
  creditGitHub: "GitHub",
  share: "Share",
  shared: "Copied",
  satellite: "Satellite",
  streets: "Streets",
  buildings: "Buildings",
  speedLayer: "Speed",
  cameras: "Cameras",
  worksLayer: "Works",
  tolls: "Tolls",
  incidentsLayer: "Incidents",
  replay: "Replay",
  locate: "My location",
  layerOnly: "Only",
  layerAll: "All",
  layerNames: "Layers",
  layerHide: "Hide",
  basemap: "Basemap",
  speedKey: "Official traffic class. Good, average, and bad are the Transport Department saturation levels.",
  pictureFailed: "The camera and works picture did not load.",
  mapFailed: "The satellite map did not start. Crossing minutes and network speed stay on screen.",
  snapshotFailed: "Snapshot did not load.",
  near: (place) => `Near ${place}`,
  facing: (direction) => direction,
  facingLabel: "Facing",
  towards: (name) => `Towards ${name}`,
  fromPlace: (name) => `From ${name}`,
  boundLabel: "Direction",
  laneLabel: "Lane",
  classLabel: "Class",
  statusLabel: "Status",
  districtLabel: "District",
  regionLabel: "Region",
  referenceLabel: "Camera",
  announcedLabel: "Announced",
  whenLabel: "Time",
  tunnel: "Tunnel",
  tunnelPortal: "Tunnel portal",
  controlPoint: "Control point",
  roadWork: "Road work",
  openStreet: "OpenStreetMap of Hong Kong",
  satelliteMap: "Satellite map of Hong Kong",
  buildingsMap: "3D building map of Hong Kong",
  mtr: "MTR",
  mtrFailed: "Next train times did not load.",
  mtrArriving: "Arriving",
  mtrDelayed: "Delayed",
  mtrNoTrain: "No train on the board",
  mtrNext: "Next stop",
  mtrPlatform: "Platform",
  mtrPosition: "Position",
  mtrMethod: "Estimated from the published minutes and the distance between stations. MTR does not publish a train position.",
  mtrBetween: (from, to) => `Between ${from} and ${to}`,
  mtrHere: (name) => `At ${name}`,
  mtrHeld: (name) => `Held at ${name}`,
  mtrDeparts: (n) => `Departs in ${n} min`,
  mtrDue: (when, platform) => (platform ? `${when} · platform ${platform}` : when),
  kmb: "KMB",
  kmbLwb: "KMB / LWB",
  lwb: "LWB",
  kmbFailed: "KMB arrivals did not load.",
  kmbStopsFailed: "KMB stops did not load.",
  kmbScheduled: "Scheduled",
  kmbNone: "No arrival on the board",
  boardLoading: "Reading the published times.",
  lrt: "Light Rail",
  lrtFailed: "Light Rail arrivals did not load.",
  lrtNone: "No arrival on the board",
  lrtArriving: "Arriving",
  citybus: "Citybus",
  citybusFailed: "Citybus arrivals did not load.",
  citybusStopsFailed: "Citybus stops did not load.",
  citybusNone: "No arrival on the board",
  gmb: "Green minibus",
  gmbFailed: "Green minibus arrivals did not load.",
  gmbStopsFailed: "Green minibus stops did not load.",
  gmbNone: "No arrival on the board",
  nlb: "New Lantao Bus",
  nlbFailed: "New Lantao Bus arrivals did not load.",
  nlbStopsFailed: "New Lantao Bus stops did not load.",
  nlbNone: "No arrival on the board",
  mtrBus: "MTR Bus",
  mtrBusFailed: "MTR bus arrivals did not load.",
  mtrBusStopsFailed: "MTR bus stops did not load.",
  mtrBusNone: "No arrival on the board",
  ferry: "Ferry",
  ferryFailed: "Ferry arrivals did not load.",
  ferryNone: "No sailing on the board",
  parking: "Car parks",
  parkingFailed: "Car parks did not load.",
  motorcycleFailed: "Motorcycle parks did not load.",
  kerb: "Motorcycle bays",
  kerbFailed: "Motorcycle bays did not load.",
  kerbBays: (n) => `${n} bays`,
  parkingNone: "No published spaces",
  parkingUnpublished: "No count published",
  parkingClosed: "Closed",
  parkingEv: "EV spaces",
  parkingPrivate: "Private car",
  parkingLgv: "Light goods",
  parkingHgv: "Heavy goods",
  parkingMotorcycle: "Motorcycle",
  parkingSpaces: (n) => `${n} ${n === 1 ? "space" : "spaces"}`,
  plateFree: "free",
  parkingAsOf: (count, time) => `${count} at ${time}`,
  parkingHeight: (n) => `Height limit ${n} m`,
  meter: "Meters",
  meterFailed: "Meters did not load.",
  meterGeneral: "Private car / light van",
  meterGoods: "Goods vehicle",
  meterCoach: "Coach",
  meterVacant: "Vacant",
  meterTaken: "Occupied",
  meterClosed: "Not in use",
  meterSince: (state, time) => `${state} since ${time}`,
  charger: "Chargers",
  chargerFailed: "Chargers did not load.",
  chargerStandard: "Standard",
  chargerMedium: "Medium",
  chargerQuick: "Quick",
  chargerFast: "Fast",
  chargerPlugs: (n) => `${n} plugs`,
  chargerList: "June 2026 list",
}

const zhHK: Messages = {
  locale: "zh-HK",
  documentTitle: "香港智慧城市交通情報網 by Keith Li",
  productMark: "香港",
  productName: "交通情報",
  live: "實時",
  sync: "同步",
  fault: "故障",
  mapOff: "地圖未顯示",
  cross: "紅隧",
  eastern: "東隧",
  western: "西隧",
  crossFull: "紅磡海底隧道",
  easternFull: "東區海底隧道",
  westernFull: "西區海底隧道",
  minutes: (n) => `${n} 分鐘`,
  approachHint: (road) => `${road}。在地圖顯示此進路口。`,
  harbourFrom: "起點",
  fromIsland: "港島出發",
  fromKowloon: "九龍出發",
  followMap: (road) => road ? `地圖最近 · ${road}` : "地圖上最近的路口",
  fastestHere: "由此起點出發，三條隧道中最快",
  slowerBy: (n) => `比最快慢 ${n} 分鐘`,
  harbourMissing: "無",
  harbourMissingHint: "這個起點沒有這條隧道的時間。",
  incident: "事故",
  incidentsOpen: (n) => `${n} 宗`,
  incidentHint: "特別交通消息",
  boundary: "管制站",
  boundaryHint: "八個陸路管制站的旅客大堂",
  weather: "天氣",
  weatherHint: "生效警告、氣溫及雨量",
  network: "路網",
  good: "暢順",
  average: "緩慢",
  bad: "擠塞",
  ranked: "優先",
  roads: "道路",
  systems: "系統",
  changelog: "更新",
  changelogAdded: "新增",
  changelogFixed: "修正",
  changelogImproved: "改進",
  hide: "收起",
  intel: "情報",
  emptyRanked: "道路、管制站及天氣暫無須優先處理的項目。",
  emptyRoads: "沒有未結束事故、擠塞路段或工程。",
  emptyBoundary: "正在等候管制站資料。",
  emptyWeather: "正在等候天文台資料。",
  emptySystems: "各項資料正常。",
  clear: "正常",
  noFeed: "沒有資料",
  veryBusyCount: (n) => `${n} 個非常繁忙`,
  badApproachCount: (n) => `${n} 條擠塞`,
  busyCount: (n) => `${n} 個繁忙`,
  slowCount: (n) => `${n} 條緩慢`,
  closedCount: (n) => `${n} 個關閉`,
  hallVeryBusy: "非常繁忙",
  hallBadApproach: "車流擠塞",
  hallBusy: "繁忙",
  hallClosed: "關閉",
  hallMaintenance: "維修",
  hallSlow: "車流緩慢",
  hallNormal: "正常",
  residentArrival: "居民入境",
  residentDeparture: "居民出境",
  visitorArrival: "訪客入境",
  visitorDeparture: "訪客出境",
  queueNormalResident: "正常，少於15分鐘",
  queueNormalVisitor: "正常，少於30分鐘",
  queueBusyResident: "繁忙，少於30分鐘",
  queueBusyVisitor: "繁忙，少於45分鐘",
  queueVeryResident: "非常繁忙，30分鐘或以上",
  queueVeryVisitor: "非常繁忙，45分鐘或以上",
  queueClosed: "關閉",
  queueMaintenance: "維修",
  queueNone: "沒有讀數",
  passengerNormal: "旅客大堂正常",
  hallsClosed: "關閉",
  passengerClearance: "旅客通關",
  vehicles: "車輛",
  noVehicleApproach: "車輛：此管制站沒有策略性道路車速",
  speedKmh: (n) => `${n} km/h`,
  lengthKm: (n) => `${n.toFixed(1)} 公里`,
  noReading: "沒有讀數",
  works: "工程",
  worksLive: "進行中",
  worksPrep: "準備中",
  crossing: "過海",
  conditions: "實況",
  observatoryTemp: (n) => `天文台 ${n}°C`,
  noRain: "過去一小時無雨",
  rainHour: (place, mm) => `過去一小時${place ? `${place} ` : ""}${mm} 毫米`,
  dry: "無雨",
  faultSpeed: "未能取得車速",
  faultIncidents: "未能取得特別交通消息",
  faultCrossings: "未能取得過海時間",
  faultBoundary: "未能取得管制站資料",
  faultWeather: "未能取得天氣警告",
  language: "語言",
  creditBy: "製作：Keith Li -",
  creditLinkedIn: "LinkedIn",
  creditGitHub: "GitHub",
  share: "分享",
  shared: "已複製",
  satellite: "衛星",
  streets: "街道",
  buildings: "樓宇",
  speedLayer: "車速",
  cameras: "快拍",
  worksLayer: "工程",
  tolls: "隧道",
  incidentsLayer: "事故",
  replay: "重播",
  locate: "我的位置",
  layerOnly: "只看",
  layerAll: "全部",
  layerNames: "圖層",
  layerHide: "收起",
  basemap: "底圖",
  speedKey: "運輸署交通狀況等級：暢順、緩慢、擠塞。",
  pictureFailed: "未能載入快拍及工程畫面。",
  mapFailed: "衛星地圖未能啟動。過海時間與路網車速仍會顯示。",
  snapshotFailed: "快拍未能載入。",
  near: (place) => `近${place}`,
  facing: (direction) => `朝${direction}`,
  facingLabel: "鏡頭",
  towards: (name) => `往${name}`,
  fromPlace: (name) => `由${name}`,
  boundLabel: "方向",
  laneLabel: "行車線",
  classLabel: "狀況",
  statusLabel: "狀態",
  districtLabel: "地區",
  regionLabel: "區域",
  referenceLabel: "編號",
  announcedLabel: "公布",
  whenLabel: "時間",
  tunnel: "隧道",
  tunnelPortal: "隧道口",
  controlPoint: "管制站",
  roadWork: "道路工程",
  openStreet: "香港街道圖",
  satelliteMap: "香港衛星地圖",
  buildingsMap: "香港三維樓宇地圖",
  mtr: "港鐵",
  mtrFailed: "未能取得港鐵到站時間。",
  mtrArriving: "到站",
  mtrDelayed: "延誤",
  mtrNoTrain: "班次表沒有列車",
  mtrNext: "下一站",
  mtrPlatform: "月台",
  mtrPosition: "位置",
  mtrMethod: "按公布的到站分鐘，沿車站之間的距離推算。港鐵沒有公布列車位置。",
  mtrBetween: (from, to) => `${from}至${to}之間`,
  mtrHere: (name) => `在${name}`,
  mtrHeld: (name) => `停在${name}`,
  mtrDeparts: (n) => `${n} 分鐘後開出`,
  mtrDue: (when, platform) => (platform ? `${when} · ${platform} 號月台` : when),
  kmb: "九巴",
  kmbLwb: "九巴／龍運",
  lwb: "龍運",
  kmbFailed: "未能取得九巴到站時間。",
  kmbStopsFailed: "未能載入九巴車站。",
  kmbScheduled: "原定班次",
  kmbNone: "班次表沒有到站時間",
  boardLoading: "正在讀取已公布的到站時間。",
  lrt: "輕鐵",
  lrtFailed: "未能取得輕鐵到站時間。",
  lrtNone: "班次表沒有到站時間",
  lrtArriving: "即將抵達",
  citybus: "城巴",
  citybusFailed: "未能取得城巴到站時間。",
  citybusStopsFailed: "未能載入城巴車站。",
  citybusNone: "班次表沒有到站時間",
  gmb: "綠色專線小巴",
  gmbFailed: "未能取得綠色專線小巴到站時間。",
  gmbStopsFailed: "未能載入綠色專線小巴車站。",
  gmbNone: "班次表沒有到站時間",
  nlb: "嶼巴",
  nlbFailed: "未能取得嶼巴到站時間。",
  nlbStopsFailed: "未能載入嶼巴車站。",
  nlbNone: "班次表沒有到站時間",
  mtrBus: "港鐵巴士",
  mtrBusFailed: "未能取得港鐵巴士到站時間。",
  mtrBusStopsFailed: "未能載入港鐵巴士車站。",
  mtrBusNone: "班次表沒有到站時間",
  ferry: "渡輪",
  ferryFailed: "未能取得渡輪航班時間。",
  ferryNone: "未有航班時間",
  parking: "停車場",
  parkingFailed: "未能載入停車場。",
  motorcycleFailed: "未能載入電單車。",
  kerb: "電單車骨位",
  kerbFailed: "未能載入電單車骨位。",
  kerbBays: (n) => `${n} 個位`,
  parkingNone: "沒有公布空位",
  parkingUnpublished: "沒有公布數目",
  parkingClosed: "關閉",
  parkingEv: "電動車位",
  parkingPrivate: "私家車",
  parkingLgv: "輕型貨車",
  parkingHgv: "重型貨車",
  parkingMotorcycle: "電單車",
  parkingSpaces: (n) => `${n} 個空位`,
  plateFree: "空位",
  parkingAsOf: (count, time) => `${count}（${time}）`,
  parkingHeight: (n) => `限高 ${n} 米`,
  meter: "咪錶",
  meterFailed: "未能載入咪錶。",
  meterGeneral: "私家車／輕型貨車",
  meterGoods: "貨車",
  meterCoach: "旅遊巴",
  meterVacant: "空置",
  meterTaken: "佔用",
  meterClosed: "停用",
  meterSince: (state, time) => `自 ${time} 起${state}`,
  charger: "充電樁",
  chargerFailed: "未能載入充電樁。",
  chargerStandard: "標準",
  chargerMedium: "中速",
  chargerQuick: "快速",
  chargerFast: "高速",
  chargerPlugs: (n) => `${n} 個`,
  chargerList: "2026年6月名單",
}

const zhCN: Messages = {
  ...zhHK,
  locale: "zh-CN",
  documentTitle: "香港智慧城市交通情报网 by Keith Li",
  productName: "交通情报",
  live: "实时",
  mapOff: "地图未显示",
  cross: "红隧",
  eastern: "东隧",
  western: "西隧",
  crossFull: "红磡海底隧道",
  easternFull: "东区海底隧道",
  westernFull: "西区海底隧道",
  minutes: (n) => `${n} 分钟`,
  approachHint: (road) => `${road}。在地图显示此进路口。`,
  harbourFrom: "起点",
  fromIsland: "港岛出发",
  fromKowloon: "九龙出发",
  followMap: (road) => road ? `地图最近 · ${road}` : "地图上最近的路口",
  fastestHere: "由此起点出发，三条隧道中最快",
  slowerBy: (n) => `比最快慢 ${n} 分钟`,
  harbourMissing: "无",
  harbourMissingHint: "这个起点没有这条隧道的时间。",
  incident: "事故",
  incidentsOpen: (n) => `${n} 宗`,
  incidentHint: "特别交通消息",
  boundaryHint: "八个陆路管制站的旅客大堂",
  weather: "天气",
  weatherHint: "生效警告、气温及雨量",
  network: "路网",
  good: "畅顺",
  average: "缓慢",
  bad: "挤塞",
  ranked: "优先",
  roads: "道路",
  systems: "系统",
  changelog: "更新",
  changelogAdded: "新增",
  changelogFixed: "修正",
  changelogImproved: "改进",
  hide: "收起",
  intel: "情报",
  emptyRanked: "道路、管制站及天气暂无须优先处理的项目。",
  emptyRoads: "没有未结束事故、挤塞路段或工程。",
  emptyBoundary: "正在等候管制站资料。",
  emptyWeather: "正在等候天文台资料。",
  emptySystems: "各项资料正常。",
  clear: "正常",
  noFeed: "没有资料",
  veryBusyCount: (n) => `${n} 个非常繁忙`,
  badApproachCount: (n) => `${n} 条挤塞`,
  busyCount: (n) => `${n} 个繁忙`,
  slowCount: (n) => `${n} 条缓慢`,
  closedCount: (n) => `${n} 个关闭`,
  hallVeryBusy: "非常繁忙",
  hallBadApproach: "车流挤塞",
  hallBusy: "繁忙",
  hallClosed: "关闭",
  hallMaintenance: "维修",
  hallSlow: "车流缓慢",
  hallNormal: "正常",
  residentArrival: "居民入境",
  residentDeparture: "居民出境",
  visitorArrival: "访客入境",
  visitorDeparture: "访客出境",
  queueNormalResident: "正常，少于15分钟",
  queueNormalVisitor: "正常，少于30分钟",
  queueBusyResident: "繁忙，少于30分钟",
  queueBusyVisitor: "繁忙，少于45分钟",
  queueVeryResident: "非常繁忙，30分钟或以上",
  queueVeryVisitor: "非常繁忙，45分钟或以上",
  queueClosed: "关闭",
  queueMaintenance: "维修",
  queueNone: "没有读数",
  passengerNormal: "旅客大堂正常",
  hallsClosed: "关闭",
  passengerClearance: "旅客通关",
  vehicles: "车辆",
  noVehicleApproach: "车辆：此管制站没有策略性道路车速",
  lengthKm: (n) => `${n.toFixed(1)} 公里`,
  noReading: "没有读数",
  works: "工程",
  worksLive: "进行中",
  worksPrep: "准备中",
  crossing: "过海",
  conditions: "实况",
  observatoryTemp: (n) => `天文台 ${n}°C`,
  noRain: "过去一小时无雨",
  rainHour: (place, mm) => `过去一小时${place ? `${place} ` : ""}${mm} 毫米`,
  dry: "无雨",
  faultSpeed: "未能取得车速",
  faultIncidents: "未能取得特别交通消息",
  faultCrossings: "未能取得过海时间",
  faultBoundary: "未能取得管制站资料",
  faultWeather: "未能取得天气警告",
  language: "语言",
  creditBy: "制作：Keith Li -",
  creditLinkedIn: "LinkedIn",
  creditGitHub: "GitHub",
  share: "分享",
  shared: "已复制",
  satellite: "卫星",
  streets: "街道",
  buildings: "楼宇",
  speedLayer: "车速",
  cameras: "快拍",
  worksLayer: "工程",
  tolls: "隧道",
  incidentsLayer: "事故",
  replay: "重播",
  locate: "我的位置",
  layerOnly: "只看",
  layerAll: "全部",
  layerNames: "图层",
  layerHide: "收起",
  basemap: "底图",
  speedKey: "运输署交通状况等级：畅顺、缓慢、挤塞。",
  pictureFailed: "未能载入快拍及工程画面。",
  mapFailed: "卫星地图未能启动。过海时间与路网车速仍会显示。",
  snapshotFailed: "快拍未能载入。",
  near: (place) => `近${place}`,
  facing: (direction) => `朝${direction}`,
  facingLabel: "镜头",
  towards: (name) => `往${name}`,
  fromPlace: (name) => `由${name}`,
  boundLabel: "方向",
  laneLabel: "行车线",
  classLabel: "状况",
  statusLabel: "状态",
  districtLabel: "地区",
  regionLabel: "区域",
  referenceLabel: "编号",
  announcedLabel: "公布",
  whenLabel: "时间",
  tunnel: "隧道",
  tunnelPortal: "隧道口",
  controlPoint: "管制站",
  roadWork: "道路工程",
  openStreet: "香港街道图",
  satelliteMap: "香港卫星地图",
  buildingsMap: "香港三维楼宇地图",
  mtr: "港铁",
  mtrFailed: "未能取得港铁到站时间。",
  mtrDelayed: "延误",
  mtrNoTrain: "班次表没有列车",
  mtrPlatform: "站台",
  mtrMethod: "按公布的到站分钟，沿车站之间的距离推算。港铁没有公布列车位置。",
  mtrBetween: (from, to) => `${from}至${to}之间`,
  mtrDeparts: (n) => `${n} 分钟后开出`,
  mtrDue: (when, platform) => (platform ? `${when} · ${platform} 号站台` : when),
  kmbFailed: "未能取得九巴到站时间。",
  kmbStopsFailed: "未能载入九巴车站。",
  kmbScheduled: "原定班次",
  kmbNone: "班次表没有到站时间",
  boardLoading: "正在读取已公布的到站时间。",
  kmbLwb: "九巴／龙运",
  lwb: "龙运",
  lrt: "轻铁",
  lrtFailed: "未能取得轻铁到站时间。",
  lrtNone: "班次表没有到站时间",
  lrtArriving: "即将抵达",
  citybus: "城巴",
  citybusFailed: "未能取得城巴到站时间。",
  citybusStopsFailed: "未能载入城巴车站。",
  citybusNone: "班次表没有到站时间",
  gmb: "绿色专线小巴",
  gmbFailed: "未能取得绿色专线小巴到站时间。",
  gmbStopsFailed: "未能载入绿色专线小巴车站。",
  gmbNone: "班次表没有到站时间",
  nlb: "屿巴",
  nlbFailed: "未能取得屿巴到站时间。",
  nlbStopsFailed: "未能载入屿巴车站。",
  nlbNone: "班次表没有到站时间",
  mtrBus: "港铁巴士",
  mtrBusFailed: "未能取得港铁巴士到站时间。",
  mtrBusStopsFailed: "未能载入港铁巴士车站。",
  mtrBusNone: "班次表没有到站时间",
  ferry: "渡轮",
  ferryFailed: "未能取得渡轮航班时间。",
  ferryNone: "未有航班时间",
  parking: "停车场",
  parkingFailed: "未能载入停车场。",
  motorcycleFailed: "未能载入电单车。",
  kerb: "电单车骨位",
  kerbFailed: "未能载入电单车骨位。",
  kerbBays: (n) => `${n} 个位`,
  parkingNone: "没有公布空位",
  parkingUnpublished: "没有公布数目",
  parkingClosed: "关闭",
  parkingEv: "电动车位",
  parkingPrivate: "私家车",
  parkingLgv: "轻型货车",
  parkingHgv: "重型货车",
  parkingMotorcycle: "电单车",
  parkingSpaces: (n) => `${n} 个空位`,
  plateFree: "空位",
  parkingAsOf: (count, time) => `${count}（${time}）`,
  parkingHeight: (n) => `限高 ${n} 米`,
  meter: "咪表",
  meterFailed: "未能载入咪表。",
  meterGeneral: "私家车／轻型货车",
  meterGoods: "货车",
  meterCoach: "旅游巴",
  meterVacant: "空置",
  meterTaken: "占用",
  meterClosed: "停用",
  meterSince: (state, time) => `自 ${time} 起${state}`,
  charger: "充电桩",
  chargerFailed: "未能载入充电桩。",
  chargerStandard: "标准",
  chargerMedium: "中速",
  chargerQuick: "快速",
  chargerFast: "高速",
  chargerPlugs: (n) => `${n} 个`,
  chargerList: "2026年6月名单",
}

export const MESSAGES: Record<Locale, Messages> = {
  "zh-HK": zhHK,
  "zh-CN": zhCN,
  en,
}

export const LOCALE_MARK: Record<Locale, string> = {
  "zh-HK": "繁",
  "zh-CN": "简",
  en: "EN",
}

const CONTROL_NAMES: Record<Locale, Record<string, string>> = {
  en: {
    HYW: "Heung Yuen Wai",
    HZM: "Hong Kong-Zhuhai-Macao Bridge",
    LMC: "Lok Ma Chau",
    LSC: "Lok Ma Chau Spur Line",
    LWS: "Lo Wu",
    MKT: "Man Kam To",
    SBC: "Shenzhen Bay",
    STK: "Sha Tau Kok",
  },
  "zh-HK": {
    HYW: "香園圍",
    HZM: "港珠澳大橋",
    LMC: "落馬洲",
    LSC: "落馬洲支線",
    LWS: "羅湖",
    MKT: "文錦渡",
    SBC: "深圳灣",
    STK: "沙頭角",
  },
  "zh-CN": {
    HYW: "香园围",
    HZM: "港珠澳大桥",
    LMC: "落马洲",
    LSC: "落马洲支线",
    LWS: "罗湖",
    MKT: "文锦渡",
    SBC: "深圳湾",
    STK: "沙头角",
  },
}

const DISTRICTS: Record<string, string> = {
  "Central & Western": "中西區",
  "Wan Chai": "灣仔",
  Eastern: "東區",
  Southern: "南區",
  "Yau Tsim Mong": "油尖旺",
  "Sham Shui Po": "深水埗",
  "Kowloon City": "九龍城",
  "Wong Tai Sin": "黃大仙",
  "Kwun Tong": "觀塘",
  "Kwai Tsing": "葵青",
  "Tsuen Wan": "荃灣",
  "Tuen Mun": "屯門",
  "Yuen Long": "元朗",
  North: "北區",
  "Tai Po": "大埔",
  "Sha Tin": "沙田",
  "Sai Kung": "西貢",
  Islands: "離島",
}

export function publishedSimplified(value: string): string {
  return value.replaceAll("\u{2B6AD}", "\u9C72")
}

export function displayText(locale: Locale, traditional: string, english: string): string {
  if (locale === "en") return english || traditional
  const source = traditional || english
  if (!source) return ""
  if (locale === "zh-CN") return publishedSimplified(simplified ? simplified(source) : source)
  return source
}

export function controlName(locale: Locale, code: string, english: string): string {
  return CONTROL_NAMES[locale][code] || (locale === "en" ? english : displayText(locale, "", english))
}

const DISTRICT_FROM_TRADITIONAL = new Map(Object.entries(DISTRICTS).map(([english, traditional]) => [traditional, english]))

export function districtName(locale: Locale, english: string): string {
  const traditional = DISTRICTS[english]
  if (!traditional) return displayText(locale, "", english)
  return displayText(locale, traditional, english)
}

export function districtFromTraditional(locale: Locale, traditional: string): string {
  return displayText(locale, traditional, DISTRICT_FROM_TRADITIONAL.get(traditional) ?? "")
}

export function canonicalDistrict(traditional: string): string {
  const name = traditional.trim()
  if (DISTRICT_FROM_TRADITIONAL.has(name)) return name
  if (name.endsWith("區")) {
    const shorter = name.slice(0, -1)
    if (DISTRICT_FROM_TRADITIONAL.has(shorter)) return shorter
  }
  return name
}

const REGIONS: Record<string, string> = {
  "Hong Kong Island": "香港島",
  Kowloon: "九龍",
  "New Territories": "新界",
}

export function regionName(locale: Locale, english: string): string {
  const traditional = REGIONS[english]
  if (!traditional) return displayText(locale, "", english)
  return displayText(locale, traditional, english)
}

export function bandWord(band: SpeedBand, m: Messages): string {
  switch (band) {
    case "free":
      return m.good
    case "slow":
      return m.average
    case "congested":
      return m.bad
    case "unknown":
      return m.noReading
    default: {
      const exhaustive: never = band
      return exhaustive
    }
  }
}

export function queueText(code: number, visitor: boolean, m: Messages): string {
  switch (code) {
    case 0:
      return visitor ? m.queueNormalVisitor : m.queueNormalResident
    case 1:
      return visitor ? m.queueBusyVisitor : m.queueBusyResident
    case 2:
      return visitor ? m.queueVeryVisitor : m.queueVeryResident
    case 99:
      return m.queueClosed
    case 4:
      return m.queueMaintenance
    default:
      return m.queueNone
  }
}

export function hallStatus(worst: number | null, vehicleBand: string, m: Messages): string {
  if (worst === 99) return m.hallClosed
  if (worst === 4) return m.hallMaintenance
  if (worst === 2) return m.hallVeryBusy
  if (vehicleBand === "congested") return m.hallBadApproach
  if (worst === 1) return m.hallBusy
  if (vehicleBand === "slow") return m.hallSlow
  return m.hallNormal
}

export function hallSummary(rows: [string, number][], m: Messages): string {
  const busy = rows.filter((row) => row[1] === 1 || row[1] === 2)
  if (busy.length > 0) {
    return busy.map(([name, code]) => `${name} ${code === 2 ? m.hallVeryBusy : m.hallBusy}`).join(" · ")
  }
  if (rows.length > 0 && rows.every((row) => row[1] === 99)) return m.hallsClosed
  return m.passengerNormal
}

export function vehicleSentence(road: string, kmh: number | null, band: string, m: Messages): string {
  if (!road || kmh == null || !isSpeedBand(band)) return ""
  const word = bandWord(band, m)
  const sep = m.locale === "en" ? ", " : "，"
  return `${road} ${m.speedKmh(Math.round(kmh))}${sep}${word}`
}

export function formatClock(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date)
}

export function hkoLang(locale: Locale): "en" | "tc" | "sc" {
  switch (locale) {
    case "zh-HK":
      return "tc"
    case "zh-CN":
      return "sc"
    case "en":
      return "en"
    default: {
      const exhaustive: never = locale
      return exhaustive
    }
  }
}
