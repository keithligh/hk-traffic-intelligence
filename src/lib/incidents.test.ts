import assert from "node:assert/strict"
import { incidentFeatures, type IncidentMessage, type RoadPoints } from "./incidents.ts"

const roads: RoadPoints[] = [
  { en: "LEI YUE MUN ROAD", tc: "鯉魚門道", points: [[114.236, 22.307]] },
]

function message(patch: Partial<IncidentMessage>): IncidentMessage {
  return {
    id: "1",
    heading: "Road Incident",
    detail: "Traffic Accident",
    locationEn: "",
    locationTc: "",
    landmarkEn: "",
    landmarkTc: "",
    betweenEn: "",
    betweenTc: "",
    direction: "",
    directionTc: "",
    headingTc: "道路事故",
    detailTc: "交通意外",
    content: "",
    contentTc: "",
    announced: "2026-10-13T18:00:00",
    closed: false,
    latitude: null,
    longitude: null,
    ...patch,
  }
}

const features = incidentFeatures(
  [
    message({ id: "road", locationEn: "Lei Yue Mun Road", locationTc: "鯉魚門道", content: "Lanes are closed." }),
    message({ id: "station", locationEn: "Lam Tin Station", locationTc: "藍田站", content: "The station is closed." }),
    message({ id: "done", locationEn: "Tsing Kwai Highway", closed: true, content: "The lanes have reopened." }),
  ],
  roads,
)

assert.deepEqual(features.map((feature) => feature.properties?.content), ["Lanes are closed.", "The station is closed."])
assert.deepEqual(features[0]?.geometry, { type: "Point", coordinates: [114.236, 22.307] })
assert.equal(features[1]?.geometry, null)
assert.equal(features[1]?.properties?.location, "藍田站")

console.log("incidents ok")
