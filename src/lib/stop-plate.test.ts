import assert from "node:assert/strict"
import { directedRouteMarks, mixedRoutePlate, shortStopTitle, stopPlate, terminusPlate } from "./stop-plate.ts"

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

const departure = terminusPlate("機場地面運輸中心", ["A41", "NA41"], [
  { route: "A41", dest: "往石門" },
  { route: "NA41", dest: "往水泉澳" },
])
assert.deepEqual(departure.lines, ["A41 往石門", "NA41 往水泉澳"])
const dropOff = terminusPlate("機場地面運輸中心 (落客站)", ["A30", "A31", "A41", "E42"], [
  { route: "A30", dest: "往機場" },
  { route: "A31", dest: "往機場" },
  { route: "A41", dest: "往機場" },
])
assert.equal(dropOff.lines[0], "往機場")
assert.equal(dropOff.lines[1], "A30 A31 A41")
assert.equal(dropOff.lines[2], "E42")

const mixed = mixedRoutePlate("機場地面運輸中心", ["A41 往石門", "NA41 往水泉澳"], ["E42"])
assert.equal(mixed.lines[0], "A41 往石門")
assert.equal(mixed.lines[1], "NA41 往水泉澳")
assert.equal(mixed.lines[2], "E42")
