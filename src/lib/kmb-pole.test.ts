import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { idsAtPlace, mergeSamePoles } from "./kmb-pole.ts"

const merged = mergeSamePoles([
  {
    id: "b",
    nameTc: "中港城 戲曲中心 (YT646)",
    nameEn: "Xiqu",
    lng: 114.1681,
    lat: 22.30034,
    routes: ["HK1"],
    clock: "ready" as const,
    calls: [{ route: "HK1", destTc: "尖沙咀及旺角", destEn: "Tsim Sha Tsui", minutes: null }],
  },
  {
    id: "a",
    nameTc: "中港城 戲曲中心 (YT646)",
    nameEn: "Xiqu",
    lng: 114.1681,
    lat: 22.30034,
    routes: ["HK1"],
    clock: "ready" as const,
    calls: [{ route: "HK1", destTc: "尖沙咀、旺角及黃大仙", destEn: "Wong Tai Sin", minutes: 13 }],
  },
])

assert.equal(merged.length, 1)
assert.equal(merged[0]?.id, "a")
assert.equal(merged[0]?.nameTc, "中港城 戲曲中心 (YT646)")
assert.equal(merged[0]?.calls?.[0]?.minutes, 13)
assert.equal(merged[0]?.clock, "ready")

const stacked = mergeSamePoles([
  {
    id: "yt646",
    nameTc: "中港城 戲曲中心 (YT646)",
    nameEn: "CHINA HONG KONG CITY, XIQU CENTRE (YT646)",
    lng: 114.168095,
    lat: 22.300341,
    routes: ["HK1"],
    clock: "ready" as const,
    calls: [{ route: "HK1", destTc: "尖沙咀", destEn: "Tsim Sha Tsui", minutes: 4 }],
  },
  {
    id: "yt645",
    nameTc: "中港城 戲曲中心 (YT645)",
    nameEn: "CHINA HONG KONG CITY, XIQU CENTRE (YT645)",
    lng: 114.168095,
    lat: 22.300341,
    routes: ["12", "215X"],
    clock: "ready" as const,
    calls: [{ route: "12", destTc: "海麗邨", destEn: "Hoi Lai", minutes: 8 }],
  },
])

assert.equal(stacked.length, 1)
assert.equal(stacked[0]?.id, "yt645")
assert.equal(stacked[0]?.nameTc, "中港城 戲曲中心 (YT645、YT646)")
assert.equal(stacked[0]?.nameEn, "CHINA HONG KONG CITY, XIQU CENTRE (YT645, YT646)")
assert.deepEqual(stacked[0]?.routes, ["12", "215X", "HK1"])
assert.deepEqual(stacked[0]?.calls?.map((call) => call.route), ["HK1", "12"])

const waiting = mergeSamePoles([
  { id: "a", nameTc: "同站", nameEn: "Same", lng: 114.1, lat: 22.3, routes: ["1"], clock: "ready" as const, calls: [] },
  { id: "b", nameTc: "同站", nameEn: "Same", lng: 114.1, lat: 22.3, routes: ["2"], clock: "waiting" as const, calls: [] },
])
assert.equal(waiting[0]?.clock, "waiting")
assert.deepEqual(waiting[0]?.routes, ["1", "2"])

const named = mergeSamePoles([
  { id: "1", nameTc: "健東路", nameEn: "Kin Tung Road", lng: 113.94941, lat: 22.293222, routes: ["37"] },
  { id: "2", nameTc: "映灣園", nameEn: "Caribbean Coast", lng: 113.94941, lat: 22.293222, routes: ["37P"] },
])
assert.equal(named.length, 1)
assert.equal(named[0]?.nameTc, "健東路、映灣園")
assert.equal(named[0]?.nameEn, "Kin Tung Road / Caribbean Coast")
assert.deepEqual(named[0]?.routes, ["37", "37P"])

const bare = mergeSamePoles([
  { id: "1", nameTc: "藍田站", nameEn: "Lam Tin", lng: 114.2, lat: 22.3, routes: ["1"] },
  { id: "2", nameTc: "藍田站 (LT607)", nameEn: "Lam Tin (LT607)", lng: 114.2, lat: 22.3, routes: ["2"] },
])
assert.equal(bare[0]?.nameTc, "藍田站 (LT607)")
assert.equal(bare[0]?.nameEn, "Lam Tin (LT607)")

const apart = mergeSamePoles([
  { id: "1", nameTc: "甲 (A)", nameEn: "A", lng: 114.168095, lat: 22.300341, routes: ["1"] },
  { id: "2", nameTc: "乙 (B)", nameEn: "B", lng: 114.168089, lat: 22.300005, routes: ["2"] },
])
assert.equal(apart.length, 2)

const huanggang = mergeSamePoles([
  { id: "hu904", nameTc: "皇崗口岸 (HU904)", nameEn: "HUANGGANG PORT (HU904)", lng: 114.067432, lat: 22.523177, routes: ["B11"] },
  { id: "hu905", nameTc: "皇崗口岸 (HU905)", nameEn: "HUANGGANG PORT (HU905)", lng: 114.067432, lat: 22.523177, routes: ["B10"] },
  { id: "hu903", nameTc: "皇崗口岸 (HU903)", nameEn: "HUANGGANG PORT (HU903)", lng: 114.067432, lat: 22.523167, routes: ["NB73"] },
])
assert.equal(huanggang.length, 1)
assert.equal(huanggang[0]?.nameTc, "皇崗口岸 (HU903、HU904、HU905)")
assert.deepEqual(huanggang[0]?.routes, ["B10", "B11", "NB73"])

const bay = mergeSamePoles([
  { id: "wt913", nameTc: "竹園邨總站 (WT913)", nameEn: "Chuk Yuen (WT913)", lng: 114.19, lat: 22.345, routes: ["1"] },
  { id: "wt916", nameTc: "竹園邨總站 (WT916)", nameEn: "Chuk Yuen (WT916)", lng: 114.19, lat: 22.345063, routes: ["2"] },
])
assert.equal(bay.length, 2)

const otherName = mergeSamePoles([
  { id: "a", nameTc: "甲 (A)", nameEn: "A", lng: 114.2, lat: 22.3, routes: ["1"] },
  { id: "b", nameTc: "乙 (B)", nameEn: "B", lng: 114.2, lat: 22.300009, routes: ["2"] },
])
assert.equal(otherName.length, 2)

const slipIds = idsAtPlace(
  [
    { id: "hu904", nameTc: "皇崗口岸 (HU904)", lng: 114.067432, lat: 22.523177 },
    { id: "hu905", nameTc: "皇崗口岸 (HU905)", lng: 114.067432, lat: 22.523177 },
    { id: "hu903", nameTc: "皇崗口岸 (HU903)", lng: 114.067432, lat: 22.523167 },
    { id: "hu900", nameTc: "皇崗口岸 (HU900)", lng: 114.068333, lat: 22.523177 },
  ],
  "hu904",
)
assert.deepEqual(slipIds.sort(), ["hu903", "hu904", "hu905"])

type CatalogueStop = { tc: string; en: string; lng: number; lat: number; routes?: string[] }
type Catalogue = { stops: Record<string, CatalogueStop> }

function catalogue(file: string): Catalogue {
  return JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8")) as Catalogue
}

function assertOnePin(file: string, routesOf: (stop: CatalogueStop, id: string) => string[]): void {
  const data = catalogue(file)
  const stops = Object.entries(data.stops)
    .filter(([, stop]) => Number.isFinite(stop.lng) && Number.isFinite(stop.lat))
    .map(([id, stop]) => ({
      id,
      nameTc: stop.tc,
      nameEn: stop.en,
      lng: stop.lng,
      lat: stop.lat,
      routes: routesOf(stop, id),
    }))
  const shown = mergeSamePoles(stops)
  const seen = new Set<string>()
  for (const stop of shown) {
    const key = `${stop.lng.toFixed(6)},${stop.lat.toFixed(6)}`
    assert.equal(seen.has(key), false, `${file} ${key} ${stop.nameTc}`)
    seen.add(key)
  }
  assert.ok(shown.length < stops.length, file)
}

const kmbRoutes = JSON.parse(readFileSync(new URL("../../data/kmb-routes.json", import.meta.url), "utf8")) as { stops: Record<string, string[]> }
assertOnePin("../../data/kmb-network.json", (_stop, id) => kmbRoutes.stops[id] ?? [])
assertOnePin("../../data/gmb-network.json", (stop) => stop.routes ?? [])
assertOnePin("../../data/nlb-network.json", (stop) => stop.routes ?? [])

const kmb = catalogue("../../data/kmb-network.json")
const china = mergeSamePoles(
  Object.entries(kmb.stops)
    .filter(([, stop]) => stop.lng === 114.168095 && stop.lat === 22.300341)
    .map(([id, stop]) => ({
      id,
      nameTc: stop.tc,
      nameEn: stop.en,
      lng: stop.lng,
      lat: stop.lat,
      routes: kmbRoutes.stops[id] ?? [],
    })),
)
assert.equal(china.length, 1)
assert.equal(china[0]?.nameTc, "中港城 戲曲中心 (YT645、YT646)")
assert.ok(china[0]?.routes.includes("HK1"))
assert.ok(china[0]?.routes.includes("12"))

console.log("pole-ok")
