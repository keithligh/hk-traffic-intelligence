// The map's sky follows the real sun over Hong Kong: night gradient after dusk,
// a warm horizon through twilight, blue with a light haze by day.

export type Sky = {
  "sky-color": string
  "horizon-color": string
  "fog-color": string
  "sky-horizon-blend": number
  "horizon-fog-blend": number
  "fog-ground-blend": number
  "atmosphere-blend": number
}

const RAD = Math.PI / 180

// Solar elevation in degrees, from the NOAA solar calculator equations
// (no refraction; good to a fraction of a degree, which is plenty for a sky).
export function sunAltitude(date: Date, lat: number, lng: number): number {
  const century = (date.getTime() / 86400000 + 2440587.5 - 2451545) / 36525
  const meanLong = (280.46646 + century * (36000.76983 + century * 0.0003032)) % 360
  const meanAnomaly = 357.52911 + century * (35999.05029 - 0.0001537 * century)
  const eccentricity = 0.016708634 - century * (0.000042037 + 0.0000001267 * century)
  const center =
    Math.sin(meanAnomaly * RAD) * (1.914602 - century * (0.004817 + 0.000014 * century)) +
    Math.sin(2 * meanAnomaly * RAD) * (0.019993 - 0.000101 * century) +
    Math.sin(3 * meanAnomaly * RAD) * 0.000289
  const omega = 125.04 - 1934.136 * century
  const apparentLong = meanLong + center - 0.00569 - 0.00478 * Math.sin(omega * RAD)
  const obliquity =
    23 + (26 + (21.448 - century * (46.815 + century * (0.00059 - century * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(omega * RAD)
  const declination = Math.asin(Math.sin(obliquity * RAD) * Math.sin(apparentLong * RAD))
  const y = Math.tan((obliquity / 2) * RAD) ** 2
  const equationOfTime =
    4 / RAD *
    (y * Math.sin(2 * meanLong * RAD) -
      2 * eccentricity * Math.sin(meanAnomaly * RAD) +
      4 * eccentricity * y * Math.sin(meanAnomaly * RAD) * Math.cos(2 * meanLong * RAD) -
      0.5 * y * y * Math.sin(4 * meanLong * RAD) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly * RAD))
  const utcMinutes = (date.getTime() / 60000) % 1440
  const solarMinutes = (((utcMinutes + equationOfTime + 4 * lng) % 1440) + 1440) % 1440
  const hourAngle = (solarMinutes / 4 - 180) * RAD
  const cosZenith =
    Math.sin(lat * RAD) * Math.sin(declination) + Math.cos(lat * RAD) * Math.cos(declination) * Math.cos(hourAngle)
  return 90 - Math.acos(Math.min(1, Math.max(-1, cosZenith))) / RAD
}

// Keyframes by sun altitude. Night is the HUD-cyan gradient the map launched with.
const NIGHT: Sky = {
  "sky-color": "#03111c",
  "horizon-color": "#1f6f8b",
  "fog-color": "#0a2433",
  "sky-horizon-blend": 0.7,
  "horizon-fog-blend": 0.6,
  "fog-ground-blend": 0.4,
  "atmosphere-blend": 0,
}
const SUNRISE: Sky = {
  "sky-color": "#1c3557",
  "horizon-color": "#e08a5a",
  "fog-color": "#5a5160",
  "sky-horizon-blend": 0.6,
  "horizon-fog-blend": 0.55,
  "fog-ground-blend": 0.4,
  "atmosphere-blend": 0,
}
const DAY: Sky = {
  "sky-color": "#3f86c4",
  "horizon-color": "#b6d4e6",
  "fog-color": "#9fb9c9",
  "sky-horizon-blend": 0.5,
  "horizon-fog-blend": 0.5,
  "fog-ground-blend": 0.5,
  "atmosphere-blend": 0,
}
const STOPS: [number, Sky][] = [
  [-6, NIGHT],
  [0, SUNRISE],
  [6, DAY],
]

const mixHex = (from: string, to: string, t: number) =>
  "#" +
  [1, 3, 5]
    .map((at) => {
      const a = parseInt(from.slice(at, at + 2), 16)
      const b = parseInt(to.slice(at, at + 2), 16)
      return Math.round(a + (b - a) * t).toString(16).padStart(2, "0")
    })
    .join("")
const mix = (a: number, b: number, t: number) => Math.round((a + (b - a) * t) * 1000) / 1000

export function skyFor(altitude: number): Sky {
  if (altitude <= STOPS[0][0]) return { ...NIGHT }
  const upper = STOPS.findIndex(([at]) => altitude < at)
  if (upper === -1) return { ...DAY }
  const [fromAt, from] = STOPS[upper - 1]
  const [toAt, to] = STOPS[upper]
  // Smoothstep so the colour eases through each keyframe rather than kinking.
  const linear = (altitude - fromAt) / (toAt - fromAt)
  const t = linear * linear * (3 - 2 * linear)
  return {
    "sky-color": mixHex(from["sky-color"], to["sky-color"], t),
    "horizon-color": mixHex(from["horizon-color"], to["horizon-color"], t),
    "fog-color": mixHex(from["fog-color"], to["fog-color"], t),
    "sky-horizon-blend": mix(from["sky-horizon-blend"], to["sky-horizon-blend"], t),
    "horizon-fog-blend": mix(from["horizon-fog-blend"], to["horizon-fog-blend"], t),
    "fog-ground-blend": mix(from["fog-ground-blend"], to["fog-ground-blend"], t),
    "atmosphere-blend": mix(from["atmosphere-blend"], to["atmosphere-blend"], t),
  }
}
