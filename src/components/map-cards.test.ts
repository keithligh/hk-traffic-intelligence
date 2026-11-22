import assert from "node:assert/strict"
import { MESSAGES } from "../lib/i18n.ts"
import { chargerPopup, corridorPopup, ferryStopPopup, kerbPopup, meterPopup, parkingPopup } from "./map-cards.ts"

type Node = {
  className: string
  textContent: string
  href?: string
  target?: string
  rel?: string
  children: Node[]
  style: Record<string, string>
  append: (...items: Node[]) => void
  replaceChildren: (...items: Node[]) => void
  isConnected: boolean
  addEventListener: () => void
}

function createElement(): Node {
  const node: Node = {
    className: "",
    textContent: "",
    children: [],
    style: {},
    isConnected: true,
    addEventListener() {},
    append(...items) {
      node.children.push(...items)
    },
    replaceChildren(...items) {
      node.children = items
    },
  }
  return node
}

const documentStub = { createElement }
Object.assign(globalThis, { document: documentStub })

function kindOf(card: Node): string {
  const head = card.children[0]
  const kind = head?.children.find((child) => child.className === "city-card-kind")
  return kind?.textContent ?? ""
}

function titleOf(card: Node): string {
  const head = card.children[0]
  const title = head?.children.find((child) => child.className === "city-card-title")
  return title?.textContent ?? ""
}

const spaces = JSON.stringify([{ id: "1", kind: "general", vacant: true, updated: "10/05/2026 06:46:59 PM" }])
const enMeter = meterPopup({ streetEn: "Nathan Road", streetTc: "彌敦道", spaces }, MESSAGES.en) as unknown as Node
assert.equal(kindOf(enMeter), "Meters")
assert.equal(titleOf(enMeter), "Nathan Road")
const hkMeter = meterPopup({ streetEn: "Nathan Road", streetTc: "彌敦道", spaces }, MESSAGES["zh-HK"]) as unknown as Node
assert.equal(kindOf(hkMeter), "咪錶")
const scMeter = meterPopup({ streetEn: "Nathan Road", streetTc: "彌敦道", spaces }, MESSAGES["zh-CN"]) as unknown as Node
assert.equal(kindOf(scMeter), "咪表")

const park = parkingPopup({ nameEn: "Airside", nameTc: "Airside" }, MESSAGES.en) as unknown as Node
assert.equal(kindOf(park), "Car parks")
const bikes = parkingPopup({ nameEn: "Bay", nameTc: "灣", motorcycle: 3 }, MESSAGES["zh-HK"]) as unknown as Node
assert.equal(kindOf(bikes), "電單車")
const charger = chargerPopup({ nameEn: "Plaza", nameTc: "廣場" }, MESSAGES.en) as unknown as Node
assert.equal(kindOf(charger), "Chargers")
const kerb = kerbPopup({ streetEn: "Queen's Road", streetTc: "皇后大道" }, MESSAGES.en) as unknown as Node
assert.equal(kindOf(kerb), "Motorcycle bays")
const speed = corridorPopup({ name: "Connaught Road" }, MESSAGES.en) as unknown as Node
assert.equal(kindOf(speed), "Speed")

const pierBoard = JSON.stringify([
  { route: "CECC", destTc: "長洲", destEn: "Cheung Chau", originTc: "", originEn: "", arriving: false, eta: "18:00", minutes: 5, remarkTc: "", remarkEn: "", scheduled: false },
])
const enPier = ferryStopPopup({ id: "sun-central", nameTc: "中環五號碼頭", nameEn: "Central Pier 5", board: pierBoard }, MESSAGES.en) as unknown as Node
const enPierBody = enPier.children[1]
const enPierCall = enPierBody?.children[0]?.children[0]
const enPierLink = enPierBody?.children.find((child) => child.className === "city-card-link")
assert.equal(enPierCall?.href, "https://ferry.hk/en-hk/central/cheung-chau")
assert.equal(enPierCall?.target, "_blank")
assert.equal(enPierLink?.href, "https://ferry.hk/en-hk/central")
assert.equal(enPierLink?.target, "_blank")

const emptyPier = ferryStopPopup({ id: "sun-chi-ma-wan", nameTc: "芝麻灣碼頭", nameEn: "Chi Ma Wan Pier", board: "[]" }, MESSAGES["zh-HK"]) as unknown as Node
const emptyPierLink = emptyPier.children[1]?.children.find((child) => child.className === "city-card-link")
assert.equal(emptyPierLink?.href, "https://ferry.hk/zh-hk/chi-ma-wan")

const vesselBoard = JSON.stringify([
  { route: "CEMW", destTc: "梅窩", destEn: "Mui Wo", originTc: "", originEn: "", arriving: false, eta: "18:10", minutes: 10, remarkTc: "", remarkEn: "", scheduled: false },
])
const scVessel = ferryStopPopup({ nameTc: "中環 – 梅窩", nameEn: "Central – Mui Wo", board: vesselBoard }, MESSAGES["zh-CN"]) as unknown as Node
const scVesselBody = scVessel.children[1]
const scVesselCall = scVesselBody?.children[0]?.children[0]
const scVesselLink = scVesselBody?.children.find((child) => child.className === "city-card-link")
assert.equal(scVesselCall?.href, "https://ferry.hk/zh-cn/central/mui-wo")
assert.equal(scVesselLink?.href, "https://ferry.hk/zh-cn/central/mui-wo")

console.log("card kind ok")
