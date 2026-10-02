import roadPointsJson from "../../data/road-points.json"

export type RoadPoints = {
  en: string
  tc: string
  points: [number, number][]
}

export type IncidentMessage = {
  id: string
  heading: string
  detail: string
  locationEn: string
  locationTc: string
  landmarkEn: string
  landmarkTc: string
  betweenEn: string
  betweenTc: string
  direction: string
  directionTc: string
  headingTc: string
  detailTc: string
  content: string
  contentTc: string
  announced: string
  closed: boolean
  latitude: number | null
  longitude: number | null
}

let roadsPromise: Promise<RoadPoints[]> | null = null

export function loadRoadPoints(): Promise<RoadPoints[]> {
  roadsPromise ??= Promise.resolve(roadPointsJson as RoadPoints[])
  return roadsPromise
}

export function parseIncidents(xml: string): IncidentMessage[] {
  return xml.split("<message>").flatMap((block) => {
    const id = field(block, "ID") || field(block, "INCIDENT_NUMBER")
    if (!id) return []
    const latitude = numberOrNull(field(block, "LATITUDE"))
    const longitude = numberOrNull(field(block, "LONGITUDE"))
    return [
      {
        id,
        heading: field(block, "INCIDENT_HEADING_EN") || field(block, "INCIDENT_HEADING_CN"),
        headingTc: field(block, "INCIDENT_HEADING_CN"),
        detail: field(block, "INCIDENT_DETAIL_EN") || field(block, "INCIDENT_DETAIL_CN"),
        detailTc: field(block, "INCIDENT_DETAIL_CN"),
        locationEn: field(block, "LOCATION_EN"),
        locationTc: field(block, "LOCATION_CN"),
        landmarkEn: field(block, "NEAR_LANDMARK_EN"),
        landmarkTc: field(block, "NEAR_LANDMARK_CN"),
        betweenEn: field(block, "BETWEEN_LANDMARK_EN"),
        betweenTc: field(block, "BETWEEN_LANDMARK_CN"),
        direction: field(block, "DIRECTION_EN") || field(block, "DIRECTION_CN"),
        directionTc: field(block, "DIRECTION_CN"),
        content: field(block, "CONTENT_EN") || field(block, "CONTENT_CN"),
        contentTc: field(block, "CONTENT_CN"),
        announced: field(block, "ANNOUNCEMENT_DATE"),
        closed: isClosed(field(block, "INCIDENT_STATUS_EN"), field(block, "INCIDENT_STATUS_CN")),
        latitude,
        longitude,
      },
    ]
  })
}

export function placeIncident(message: IncidentMessage, roads: RoadPoints[]): [number, number] | null {
  if (
    message.latitude != null &&
    message.longitude != null &&
    message.latitude >= 22 &&
    message.latitude <= 23 &&
    message.longitude >= 113.8 &&
    message.longitude <= 114.5
  ) {
    return [message.longitude, message.latitude]
  }
  const location = pointsFor(roads, message.locationEn, message.locationTc)
  if (location.length === 0) return null
  const landmark = pointsFor(roads, message.landmarkEn, message.landmarkTc)
  const between = pointsFor(roads, message.betweenEn, message.betweenTc)
  if (landmark.length > 0 && between.length > 0) {
    return nearest(
      location,
      (point) => distanceKm(point, closest(landmark, point)) + distanceKm(point, closest(between, point)),
    )
  }
  if (landmark.length > 0) return nearest(location, (point) => distanceKm(point, closest(landmark, point)))
  if (between.length > 0) return nearest(location, (point) => distanceKm(point, closest(between, point)))
  return location[Math.floor(location.length / 2)] ?? null
}

function pointsFor(roads: RoadPoints[], en: string, tc: string): [number, number][] {
  const english = normEn(en)
  const chinese = normTc(tc)
  if (!english && !chinese) return []
  const exact = roads.filter(
    (road) => (chinese && normTc(road.tc) === chinese) || (english && normEn(road.en) === english),
  )
  const chosen =
    exact.length > 0
      ? exact
      : roads.filter((road) => {
          const roadEn = normEn(road.en)
          const roadTc = normTc(road.tc)
          const enHit =
            english.length >= 8 && roadEn.length >= 8 && (roadEn.startsWith(english) || english.startsWith(roadEn))
          const tcHit =
            chinese.length >= 2 && roadTc.length >= 2 && (roadTc.startsWith(chinese) || chinese.startsWith(roadTc))
          return enHit || tcHit
        })
  return chosen.flatMap((road) => road.points)
}

function closest(points: [number, number][], target: [number, number]): [number, number] {
  return nearest(points, (point) => distanceKm(point, target))
}

function nearest(points: [number, number][], score: (point: [number, number]) => number): [number, number] {
  let best = points[0] ?? [114.17, 22.3]
  let bestScore = score(best)
  for (const point of points.slice(1)) {
    const next = score(point)
    if (next < bestScore) {
      best = point
      bestScore = next
    }
  }
  return best
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const dLng = (a[0] - b[0]) * 102
  const dLat = (a[1] - b[1]) * 111
  return Math.hypot(dLng, dLat)
}

function normEn(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function normTc(value: string): string {
  return value.replace(/[\s－—–\-　]/g, "")
}

function isClosed(english: string, chinese: string): boolean {
  return english.toUpperCase() === "CLOSED" || chinese === "完結"
}

function numberOrNull(value: string): number | null {
  if (!value) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function field(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match?.[1]?.trim() ?? ""
}
