[繁體中文](README.zh-HK.md)

# HK Traffic Intelligence

香港智慧城市交通情報網

This is a Hong Kong Smart City dashboard. It brings the live city together on one map: the harbour crossings, the strategic roads, MTR and Light Rail trains, KMB, Long Win, Citybus, green minibus and New Lantao Bus arrivals, the ferry piers, the land boundary waits, and Observatory weather.

This map is possible because the Hong Kong Government publishes these feeds as open data. The Transport Department, the Immigration Department, the Observatory, and the teams behind HKeMobility and DATA.GOV.HK release the figures to the public, alongside MTR, KMB, Long Win, Citybus, the green minibus operators, New Lantao Bus, Sun Ferry, Hong Kong and Kowloon Ferry, and the Star Ferry, and this site simply reads them together.

Open it at [hktraffic.keith-li.workers.dev](https://hktraffic.keith-li.workers.dev). There is no account to create and nothing to install. The site opens in Traditional Chinese. Simplified Chinese and English are available from the language switch beside the clock. The Updates button on the top bar lists what has been added or fixed.

[![Live demo](https://img.shields.io/badge/▶_Open_the_map-hktraffic.keith--li.workers.dev-0891b2?style=for-the-badge)](https://hktraffic.keith-li.workers.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/keithligh/hk-traffic-intelligence?style=for-the-badge)](https://github.com/keithligh/hk-traffic-intelligence)

![Hong Kong traffic map: satellite view, coloured strategic roads, live harbour minutes, and the header](docs/board.png)

If this Smart City dashboard helped you pick a better time to cross the harbour, or you want more people to find it, please [star the repository](https://github.com/keithligh/hk-traffic-intelligence). A star is how new readers discover the project, and it is the simplest way to support it.

## What the site is for

The site answers a small set of practical questions: how long the three harbour crossings take right now, whether the road you plan to use is running well, whether the boundary hall you plan to use is busy, whether an Observatory warning is in force, and when the next train or bus actually comes.

It does not plan driving routes. It reads the figures that public bodies already publish and places them side by side, so the harbour, the roads, the boundary, the weather, and public transport can be weighed together. The source behind each part of the dashboard is listed further down.

## What the dashboard shows

For crossing the harbour and driving in town, the dashboard starts with the essentials. The Cross-Harbour Tunnel, the Eastern Harbour Crossing, and the Western Harbour Crossing show journey times from the same roadside sign, the one nearest the map. Another sign can be chosen, so the three tunnels are compared from one starting point. Strategic roads use the Transport Department grades of Good, Average, and Bad, and show a live speed wherever one has been published. You can open the street cams, including the tunnel mouths. Road works on the major routes, toll points at the harbour crossings and Tai Lam Tunnel, and special traffic notices that are still in force are all on the same view.

For going through the boundary and checking the weather, the next group follows. The eight land control points show the passenger halls for residents and visitors, arriving and departing, together with the live speed on the strategic road that leads to each port. Lo Wu serves passengers rather than private cars, so its published figures include no private car queue. Every Observatory warning in force is listed. On a quiet day the site still reports the Observatory temperature and whether rain fell in the past hour.

For catching a train or a bus, the dashboard works the same way. MTR lines are drawn on the map and each train moves from the next-train minutes, destination, and platform that MTR publishes. Light Rail keeps its own tracks through Tuen Mun, Yuen Long, and Tin Shui Wai, and each train moves from the minutes published for those stations. KMB and Long Win stops show the published arrival, including trips marked as scheduled because no live position is available yet. Long Win in this feed covers the airport and Tung Chung routes, including the A, E, S, N, NA, and R series. Citybus stops show the published arrival across Hong Kong Island and the other routes Citybus runs. Green minibus stops show the route number, where that minibus is going, and the arrival clock when one is published. New Lantao Bus stops appear when the map is looking at Lantau. Ferry piers for the Star Ferry, Sun Ferry, and Hong Kong and Kowloon Ferry stay on the map. The Star Ferry shows how often the boat runs. Sun Ferry and Hong Kong and Kowloon Ferry show the next sailing. Fortune Ferry shows the North Point and Kwun Tong timetable, and marks it as a timetable. When Sun Ferry publishes a boat position, the map uses it. A sailing with no published position follows the harbour or the sea channel and moves with the sailing time.

When several things need attention at once, the site puts them in order. An open traffic notice, a road graded Bad, a very busy hall, or a weather warning rises to the top, so the urgent item is read first.

Hong Kong publishes far more open data than this Smart City dashboard uses. What appears here is the traffic, boundary, weather, MTR, Light Rail, KMB, Long Win, Citybus, green minibus, New Lantao Bus, and ferry coverage listed further down.

## Open source

The code for this Smart City dashboard is open source under the [MIT License](LICENSE). Clone it, run it, change it, and fork it. If you fork or reuse the work, please keep the copyright notice and credit [HK Traffic Intelligence](https://github.com/keithligh/hk-traffic-intelligence) and [Keith Li](https://github.com/keithligh).

You need Node.js 22.

```bash
git clone https://github.com/keithligh/hk-traffic-intelligence.git
cd hk-traffic-intelligence
npm install
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js on port 4317 |
| `npm run lint` | ESLint |
| `npm run dev:vinext` | The Cloudflare-oriented dev server on port 4318 |

The application is written with Next.js, React, MapLibre GL, and Tailwind CSS, and the public site runs as a Cloudflare Worker.

## How the site stays light

Everyone who opens the public site reads from one shared copy of each feed, held on Cloudflare for the whole city. Trains are renewed about every fifteen seconds, KMB and Long Win about every thirty seconds, and Citybus, green minibus, New Lantao Bus, the ferries, and the remaining feeds about once a minute. Green minibus and New Lantao Bus are read only for the stops in the current view. A map of Kowloon does not ask New Lantao Bus for arrivals. While a copy is still current, the next visitor is served from it. A fresh request goes to the publishing organisation only when that copy falls due for renewal. Many people can therefore read the dashboard at once, at the pace those organisations already publish, and the site does not add load to government servers.

## Where the numbers come from

Each row is one part of the dashboard and the publication it is drawn from. This table covers only what the dashboard uses.

| On the map | Open data |
| --- | --- |
| Speed and official grade on strategic roads | [Traffic data of strategic and major roads](https://data.gov.hk/en-data/dataset/hk-td-sm_4-traffic-data-strategic-major-roads), with grades as shown on [HKeMobility](https://www.hkemobility.gov.hk/en/) |
| The shape of those roads | [Road Network, second generation](https://data.gov.hk/en-data/dataset/hk-td-tis_15-road-network-v2) |
| Journey times at the harbour crossings | Journey-time information on [HKeMobility](https://www.hkemobility.gov.hk/en/) |
| Street cams, in English and Traditional Chinese | Street cam images on [HKeMobility](https://www.hkemobility.gov.hk/en/) |
| Speed cam housings | [Locations of speed enforcement camera housing](https://data.gov.hk/en-data/dataset/hk-td-tis_26-locations-of-sec) and [Junctions with Red Light Camera System installed](https://data.gov.hk/en-data/dataset/hk-td-tis_25-junctions-with-rlc) |
| Road works | Road works on [HKeMobility](https://www.hkemobility.gov.hk/en/) |
| Toll points | Toll points on [HKeMobility](https://www.hkemobility.gov.hk/en/) |
| Special traffic news | [Special traffic news](https://data.gov.hk/en-data/dataset/hk-td-tis_19-special-traffic-news-v2) |
| Traffic detectors on smart lampposts | [Traffic detectors installed at smart lampposts](https://data.gov.hk/en-data/dataset/hk-td-tis_33-traffic-data-traffic-detectors-installed-at-smart-lampposts) |
| Waiting times at land control points | Immigration Department, [waiting time at land boundary control points](https://data.gov.hk/en-data/dataset/hk-immd-set28-land-boundary-control-points-waiting-time) |
| The next MTR train | [Next train](https://data.gov.hk/en-data/dataset/mtr-data2-nexttrain-data), with station locations from the Lands Department [indoor station footprints](https://portal.csdi.gov.hk/csdi-webpage/apidoc/3d-indoor-mtr-station-map) |
| The next Light Rail train | [Light Rail next train](https://data.gov.hk/en-data/dataset/mtr-lrnt_data-light-rail-nexttrain-data) |
| The next KMB or Long Win arrival | [Estimated time of arrival for KMB and LWB](https://data.etabus.gov.hk/v1/transport/kmb/stop) |
| The next Citybus arrival | [Citybus next bus](https://data.gov.hk/en-data/dataset/ctb-eta-transport-realtime-eta) |
| The next green minibus, and where it is going | Transport Department [green minibus routes and arrivals](https://data.etagmb.gov.hk/route/HKI) |
| The next New Lantao Bus arrival | [New Lantao Bus estimated arrivals](https://rt.data.gov.hk/v2/transport/nlb/route.php?action=list) |
| Sun Ferry sailings | [Sun Ferry estimated arrival](https://www.sunferry.com.hk/eta/?route=CECC) |
| Hong Kong and Kowloon Ferry sailings | [Hong Kong and Kowloon Ferry open data](https://www.hkkfeta.com/opendata/route) |
| Star Ferry frequency | [Central to Tsim Sha Tsui timetable](https://www.starferry.com.hk/sites/default/files/upload/open_data/csv/ferry_sf_central_tsimshatsui_timetable_eng.csv) |
| Fortune Ferry timetable | [Fortune Ferry route and fare](https://www.fortuneferry.com.hk/en/route-and-fare) for North Point and Kwun Tong |
| Warnings, temperature, and rainfall | Hong Kong Observatory [warning summary](https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en) and [regional weather report](https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en) |
| Street map and buildings | [OSM Bright](https://github.com/openmaptiles/osm-bright-gl-style) and [OSM Liberty](https://github.com/maputnik/osm-liberty), served by [OpenFreeMap](https://openfreemap.org), from [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors and [OpenMapTiles](https://openmaptiles.org/) |
| Satellite photograph | [Esri World Imagery](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer). Imagery © Esri |

## Author

[Keith Li](https://www.linkedin.com/in/keithlihk) made this Smart City dashboard for Agentic Engineer classes, for public talks, and for guest lectures. It is possible because the Transport Department, the Immigration Department, the Observatory, MTR, KMB, Long Win, Citybus, the green minibus operators, New Lantao Bus, Sun Ferry, Hong Kong and Kowloon Ferry, Fortune Ferry, the Star Ferry, and the teams behind HKeMobility already publish these figures for the public.

If you have used the map, please [star the repository](https://github.com/keithligh/hk-traffic-intelligence). That star is how the next reader finds this Smart City project.

Keith is on [LinkedIn](https://www.linkedin.com/in/keithlihk) and [GitHub](https://github.com/keithligh).
