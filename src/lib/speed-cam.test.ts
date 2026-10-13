import assert from "node:assert/strict"
import { parseSpeedCameras } from "./speed-cam.ts"

const sample = {
  features: [
    {
      attributes: {
        OBJECTID: 1,
        PopupInfo: "<th>SEC_ID</th>\n<td>1</td>\n<th>SITE_DESC_ENG</th>\n<td>ABERDEEN PRAYA ROAD (WESTBOUND) NEAR WHOLESALE FISH MARKET</td>\n<th>SITE_DESC_CHI</th>\n<td>香港仔海旁道（西行）鄰近香港仔魚類批發巿場</td>\n<th>SITE_DESC_SCHI</th>\n<td>香港仔海旁道（西行）邻近香港仔鱼类批发巿场</td>\n<th>REMARKS</th>\n<td></td>",
      },
      geometry: { x: 114.151768, y: 22.248083 },
    },
    {
      attributes: { PopupInfo: "<th>SEC_ID</th><td></td>" },
      geometry: { x: 114.15, y: 22.24 },
    },
    {
      attributes: { PopupInfo: "<th>SEC_ID</th><td>9</td><th>SITE_DESC_CHI</th><td>沒有座標</td>" },
      geometry: { x: 0, y: 0 },
    },
    {
      attributes: {
        PopupInfo: "<th>RLC_ID</th><td>1</td><th>SITE_DESC_ENG</th><td>QUEEN'S ROAD E. (WEST BOUND) AT JUNCTION WITH QUEENSWAY</td><th>SITE_DESC_CHI</th><td>皇后大道東（西行）與金鐘道交界</td>",
      },
      geometry: { x: 114.167365, y: 22.277851 },
    },
  ],
}

const parsed = parseSpeedCameras(sample)
assert.equal(parsed.features.length, 2)
const feature = parsed.features[0]
assert.equal(feature?.properties?.id, "1")
assert.equal(feature?.properties?.nameTc, "香港仔海旁道（西行）鄰近香港仔魚類批發巿場")
assert.deepEqual(feature?.geometry, { type: "Point", coordinates: [114.151768, 22.248083] })
const light = parsed.features[1]
assert.equal(light?.properties?.id, "rlc-1")
assert.equal(light?.properties?.nameTc, "皇后大道東（西行）與金鐘道交界")
assert.equal(parseSpeedCameras(null).features.length, 0)

console.log("speed cam ok")
