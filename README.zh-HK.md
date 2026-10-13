[English](README.md)

# 香港智慧城市交通情報網

香港智慧城市交通情報網把即時城市集中在同一幅地圖上：過海隧道、策略性道路、港鐵和輕鐵列車、九巴、龍運、城巴、綠色專線小巴和嶼巴到站時間、渡輪碼頭、陸路口岸輪候，以及天文台天氣。

這個儀表板之所以做得到，是因為香港政府把這些資料以開放數據形式公布。運輸署、入境事務處、天文台，以及負責 HKeMobility 和 DATA.GOV.HK 的團隊，向公眾發放這些數字，港鐵、九巴、龍運、城巴、綠色專線小巴營辦商、嶼巴、新渡輪、港九小輪和天星小輪亦公布各自的班次資料，而這個網站只是把它們放在一起閱讀。

網站設於 [hktraffic.keith-li.workers.dev](https://hktraffic.keith-li.workers.dev)。不需要開設帳戶，也不用安裝任何東西。網站預設以繁體中文顯示。如要轉用簡體中文或英文，請按時鐘旁邊的語言按鈕。頂欄的「更新」列出新增和修正。

[![開啟地圖](https://img.shields.io/badge/▶_開啟地圖-hktraffic.keith--li.workers.dev-0891b2?style=for-the-badge)](https://hktraffic.keith-li.workers.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/keithligh/hk-traffic-intelligence?style=for-the-badge)](https://github.com/keithligh/hk-traffic-intelligence)

![香港交通地圖：衛星底圖、著色道路，以及頂端的實時讀數](docs/board.png)

如果香港智慧城市交通情報網幫你選了較好的過海時間，或者你希望更多人看見它，請在 GitHub [按 star](https://github.com/keithligh/hk-traffic-intelligence)。Star 會讓下一位讀者找到它，也是支持它最簡單的方法。

## 這個網站做什麼

網站回答幾個實際問題：三條過海隧道現在要走多久，你打算用的道路是否暢順，你打算用的口岸大堂是否繁忙，天文台有沒有警告生效，以及下一班車和下一班巴士何時到站。

網站不規劃行車路線。它把公營機構已經公布的數字並排放在一起，讓過海、道路、口岸、天氣和公共交通可以一併衡量。每部分地圖的來源在本頁稍後列出。

## 儀表板上可以看到什麼

過海和在市內開車方面，儀表板先顯示最基本的資料。紅磡海底隧道、東區海底隧道和西區海底隧道，顯示同一個路口量度的行車時間，預設是地圖上最近的路口。也可以另選起點，讓三條隧道從同一處比較。策略性道路沿用運輸署的暢順、緩慢和擠塞等級，已公布車速的路段會顯示該車速。街拍可以直接打開，包括隧道口。主要道路的工程、過海隧道和大欖隧道的收費點，以及仍然生效的特別交通消息，都在同一個畫面。

過關和看天氣方面，下一組資料隨後出現。八個陸路管制站顯示旅客大堂，分居民與訪客、入境與出境，並一併顯示通往該口岸的策略性道路車速。羅湖供旅客過關，不設私家車通道，所以已公布的數字不包括私家車輪候。生效中的天文台警告會全部列出。天色平靜時，網站仍會報出天文台氣溫，以及過去一小時有沒有下雨。

搭港鐵和巴士方面，儀表板是同一個做法。港鐵路線畫在地圖上，每班列車按港鐵已公布的下一班車分鐘、終點和月台移動。輕鐵在屯門、元朗和天水圍有自己的路軌，每班車按那些車站已公布的到站分鐘移動。九巴和龍運車站顯示已公布的到站時間，包括尚未有實時位置、只提供原定時間的班次。這份資料裏的龍運，以機場和東涌路線為主，包括 A、E、S、N、NA 和 R 系列。城巴車站顯示已公布的到站時間，涵蓋港島和城巴行走的其他路線。綠色專線小巴車站顯示路線編號和目的地，若已公布到站時間，亦一併顯示。地圖望向大嶼山時，才顯示嶼巴車站。天星小輪、新渡輪和港九小輪的碼頭留在地圖上。天星小輪顯示班次相隔多久。新渡輪和港九小輪顯示下一班開出時間。富裕小輪顯示北角和觀塘的船期，並註明是船期。新渡輪公布船位時，地圖使用該船位。沒有公布船位的航班，沿海港或航道顯示，並按開出和到達時間移動。

若幾項情況同時需要留意，網站會把它們排好次序。尚未結束的交通消息、列為擠塞的道路、非常繁忙的旅客大堂或天氣警告會排在前面，讓人先讀到最重要的消息。

香港公開的數據，遠多於這個智慧城市儀表板所用的部分。這裏出現的，是本頁稍後列出的交通、口岸、天氣、港鐵、輕鐵、九巴、龍運、城巴、綠色專線小巴、嶼巴和渡輪資料。

## 開源

香港智慧城市交通情報網的程式以 [MIT License](LICENSE) 開源。歡迎複製、在本機運行、修改和 fork。如果你 fork 或重用這些程式，請保留版權聲明，並致謝 [香港智慧城市交通情報網](https://github.com/keithligh/hk-traffic-intelligence) 和 [Keith Li](https://github.com/keithligh)。

需要 Node.js 22。

```bash
git clone https://github.com/keithligh/hk-traffic-intelligence.git
cd hk-traffic-intelligence
npm install
npm run dev
```

開啟 [http://127.0.0.1:4317](http://127.0.0.1:4317)。

| 指令 | 作用 |
| --- | --- |
| `npm run dev` | 在 4317 埠啟動 Next.js |
| `npm run lint` | ESLint |
| `npm run dev:vinext` | 在 4318 埠啟動面向 Cloudflare 的開發伺服器 |

程式以 Next.js、React、MapLibre GL 和 Tailwind CSS 撰寫，公開網站以 Cloudflare Worker 提供。

## 網站如何保持輕盈

任何人打開公開網站，讀到的都是每一項資料的共用副本，放在 Cloudflare，供全城共用。列車大約每十五秒更新，九巴和龍運大約每三十秒，城巴、綠色專線小巴、嶼巴、渡輪和其餘資料大約每一分鐘。綠色專線小巴和嶼巴只讀取目前畫面裏的車站。地圖望向九龍時，不會向嶼巴查詢到站時間。副本仍然有效時，下一位訪客讀的就是這份副本。只有在副本到期需要更新時，網站才會向公布該資料的機構再讀取一次。很多人因此可以同時閱讀這個儀表板，節奏跟隨這些機構本身公布資料的速度，而網站不會加重政府伺服器的負擔。

## 數字從哪裏來

下表每一列都是儀表板的一部分，以及它所採用的公布來源。表內只是這個儀表板用到的資料。

| 畫面上的 | 開放數據 |
| --- | --- |
| 策略性道路的車速和官方等級 | [策略性道路及主要道路交通數據](https://data.gov.hk/tc-data/dataset/hk-td-sm_4-traffic-data-strategic-major-roads)，等級見 [HKeMobility](https://www.hkemobility.gov.hk/tc/) |
| 這些道路的形狀 | [道路網絡（第二代）](https://data.gov.hk/tc-data/dataset/hk-td-tis_15-road-network-v2) |
| 過海隧道的行車時間 | [HKeMobility](https://www.hkemobility.gov.hk/tc/) 的行車時間 |
| 英文和繁體中文的街拍 | [HKeMobility](https://www.hkemobility.gov.hk/tc/) 的街拍 |
| 快相 | [偵察車速攝影機箱的地點](https://data.gov.hk/tc-data/dataset/hk-td-tis_26-locations-of-sec) 及 [裝設衝紅燈攝影機系統的路口](https://data.gov.hk/tc-data/dataset/hk-td-tis_25-junctions-with-rlc) |
| 道路工程 | [HKeMobility](https://www.hkemobility.gov.hk/tc/) 的道路工程 |
| 收費點 | [HKeMobility](https://www.hkemobility.gov.hk/tc/) 的收費點 |
| 特別交通消息 | [特別交通消息](https://data.gov.hk/tc-data/dataset/hk-td-tis_19-special-traffic-news-v2) |
| 智慧燈柱上的交通探測器 | [裝設於智慧燈柱的交通探測器](https://data.gov.hk/tc-data/dataset/hk-td-tis_33-traffic-data-traffic-detectors-installed-at-smart-lampposts) |
| 陸路管制站的輪候時間 | 入境事務處，[陸路管制站輪候時間](https://data.gov.hk/tc-data/dataset/hk-immd-set28-land-boundary-control-points-waiting-time) |
| 下一班港鐵 | [下一班車](https://data.gov.hk/tc-data/dataset/mtr-data2-nexttrain-data)，車站位置來自地政總署的[車站室內平面](https://portal.csdi.gov.hk/csdi-webpage/apidoc/3d-indoor-mtr-station-map) |
| 下一班輕鐵 | [輕鐵實時列車服務資訊](https://data.gov.hk/tc-data/dataset/mtr-lrnt_data-light-rail-nexttrain-data) |
| 下一班九巴或龍運 | [九巴及龍運的預計到站時間](https://data.etabus.gov.hk/v1/transport/kmb/stop) |
| 下一班城巴 | [城巴實時到站時間](https://data.gov.hk/tc-data/dataset/ctb-eta-transport-realtime-eta) |
| 下一班綠色專線小巴，以及它前往的地點 | 運輸署[綠色專線小巴路線和到站時間](https://data.etagmb.gov.hk/route/HKI) |
| 下一班嶼巴 | [嶼巴預計到站時間](https://rt.data.gov.hk/v2/transport/nlb/route.php?action=list) |
| 新渡輪航班 | [新渡輪預計到站時間](https://www.sunferry.com.hk/eta/?route=CECC) |
| 港九小輪航班 | [港九小輪開放數據](https://www.hkkfeta.com/opendata/route) |
| 天星小輪班次 | [中環至尖沙咀時間表](https://www.starferry.com.hk/sites/default/files/upload/open_data/csv/ferry_sf_central_tsimshatsui_timetable_eng.csv) |
| 富裕小輪船期 | 北角和觀塘的[富裕小輪路線和票價](https://www.fortuneferry.com.hk/zh/route-and-fare) |
| 警告、氣溫和雨量 | 香港天文台的[警告摘要](https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc)和[本港地區天氣報告](https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc) |
| 街道圖和樓宇 | [OSM Bright](https://github.com/openmaptiles/osm-bright-gl-style) 和 [OSM Liberty](https://github.com/maputnik/osm-liberty)，由 [OpenFreeMap](https://openfreemap.org) 提供，數據來自 [OpenStreetMap](https://www.openstreetmap.org/copyright) 貢獻者和 [OpenMapTiles](https://openmaptiles.org/) |
| 衛星照片 | [Esri World Imagery](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer)。影像 © Esri |

## 作者

[Keith Li](https://www.linkedin.com/in/keithlihk) 製作香港智慧城市交通情報網，用於 Agentic Engineer 的課堂、公開演講和大學客席講座。它之所以做得到，是因為運輸署、入境事務處、香港天文台、港鐵、九巴、龍運、城巴、綠色專線小巴營辦商、嶼巴、新渡輪、港九小輪、富裕小輪、天星小輪，以及負責 HKeMobility 的團隊，已經把這些數字向公眾公布。

如果你用過香港智慧城市交通情報網，請 [按 star](https://github.com/keithligh/hk-traffic-intelligence)。下一位讀者就是這樣找到它的。

Keith 的 [LinkedIn](https://www.linkedin.com/in/keithlihk) 和 [GitHub](https://github.com/keithligh)。
