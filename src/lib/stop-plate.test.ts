import assert from "node:assert/strict"
import { directedRouteMarks, mixedRoutePlate, shortStopTitle, stopPlate } from "./stop-plate.ts"
import { directionIsNews, spokenPlace } from "./spoken-place.ts"

assert.equal(shortStopTitle("屯門公路巴士轉乘站(上層), 屯門公路"), "上層")
assert.equal(shortStopTitle("屯門公路巴士轉乘站(下層), 青山公路"), "下層")
assert.equal(shortStopTitle("Tuen Mun Road Bus-Bus Interchange (Upper Level), Tuen Mun Road"), "Upper")
assert.equal(shortStopTitle("Tuen Mun Road Bus-Bus Interchange (Lower Level), Castle Peak Road"), "Lower")
assert.equal(shortStopTitle("置樂花園, 青山公路"), "置樂花園")
assert.equal(shortStopTitle("Chi Lok Fa Yuen, Castle Peak Road"), "Chi Lok Fa Yuen")

const named = stopPlate("金鐘", [])
assert.equal(named.title, "金鐘")
assert.deepEqual(named.lines, [])

const lower = stopPlate("屯門公路巴士轉乘站(下層), 青山公路", ["N952", "962", "952", "952C", "962"])
assert.equal(lower.title, "下層")
assert.deepEqual(lower.lines, ["952 952C 962", "N952"])

const town = stopPlate("置樂花園, 青山公路", ["962X", "952", "B3", "962C"])
assert.equal(town.lines[0], "952 962C 962X")
assert.equal(town.lines.join(" ").split(" ").includes("962"), false)

const headed = directedRouteMarks(
  ["118", "613", "8X"],
  [
    { route: "118", dest: "往小西灣" },
    { route: "118", dest: "往小西灣" },
    { route: "613", dest: "" },
  ],
)
assert.equal(headed.directed, true)
assert.deepEqual(headed.marks, ["118 往小西灣", "613", "8X"])
const plate = stopPlate("興華邨裕興樓", headed.marks, { perLine: 1, keepOrder: true })
assert.equal(plate.lines[0], "118 往小西灣")
assert.equal(plate.lines.includes("613"), true)

const unnamed = directedRouteMarks([], [{ route: "49S", dest: "往屯門兆康苑" }])
assert.deepEqual(unnamed.marks, ["49S 往屯門兆康苑"])

const airportRoutes = ["A41", "NA41"]
const shekMun = { route: "A41", destTc: "碩門邨", destEn: "SHEK MUN ESTATE" }
const departure = airportRoutes.flatMap((route) => {
  const heading = route === "A41" ? shekMun : { route, destTc: "水泉澳", destEn: "SHUI CHUEN O" }
  if (!directionIsNews("機場地面運輸中心", "AIRPORT (GTC)", heading.destTc, heading.destEn)) return []
  const spoken = spokenPlace(heading.destTc, heading.destEn)
  return [{ route, dest: `往${spoken.tc}` }]
})
const departurePlate = directedRouteMarks(airportRoutes, departure)
assert.deepEqual(departurePlate.directedMarks, ["A41 往石門", "NA41 往水泉澳"])
assert.equal(directionIsNews("機場地面運輸中心 (落客站)", "AIRPORT (GTC) (ALIGHTING STOP)", "機場(地面運輸中心)", "AIRPORT (GROUND TRANSPORTATION CENTRE)"), false)

const mixed = mixedRoutePlate("機場地面運輸中心", ["A41 往石門", "NA41 往水泉澳"], ["E42"])
assert.equal(mixed.lines[0], "A41 往石門")
assert.equal(mixed.lines[1], "NA41 往水泉澳")
assert.equal(mixed.lines[2], "E42")
