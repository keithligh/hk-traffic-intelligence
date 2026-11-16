# Builds data/citybus-variants.json from the Transport Department GTFS.
# Citybus publishes one stop list per route number. The GTFS keeps each special
# as its own route, so a stop can name the specials that actually call there.
import csv
import json
import math
import re
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TC_URL = "https://static.data.gov.hk/td/pt-headway-tc/gtfs.zip"
EN_URL = "https://static.data.gov.hk/td/pt-headway-en/gtfs.zip"
MATCH_METRES = 45
CITYBUS_AGENCIES = {"CTB", "KMB+CTB", "LWB+CTB"}
GENERIC = {"循環線", "circular"}


def destination(name: str) -> str:
    if " - " not in name:
        return name
    return name.split(" - ", 1)[1]


def describe(name: str) -> tuple[str, str]:
    dest = destination(name)
    notes = [part.strip() for part in re.findall(r"[（(]([^）)]+)[）)]", dest) if part.strip().lower() not in GENERIC]
    place = re.sub(r"\s*[（(][^）)]*[）)]", "", dest).strip(" ,")
    joiner = ", " if "(" in dest and "（" not in dest else "，"
    return joiner.join(notes), place


def metres(lng: float, lat: float, other_lng: float, other_lat: float) -> float:
    cos = math.cos(lat * math.pi / 180)
    east = (other_lng - lng) * cos * 111_320
    north = (other_lat - lat) * 110_540
    return math.hypot(east, north)


def download(url: str, path: Path) -> None:
    if path.exists() and path.stat().st_size > 0:
        return
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=120) as response, path.open("wb") as handle:
        handle.write(response.read())


def read_routes(zip_path: Path) -> dict[str, dict[str, str]]:
    routes: dict[str, dict[str, str]] = {}
    with zipfile.ZipFile(zip_path) as archive, archive.open("routes.txt") as handle:
        for row in csv.DictReader(line.decode("utf-8-sig") for line in handle):
            if row["agency_id"] not in CITYBUS_AGENCIES:
                continue
            routes[row["route_id"]] = {
                "agency": row["agency_id"],
                "short": row["route_short_name"].strip(),
                "long": row["route_long_name"].strip(),
            }
    return routes


def main() -> None:
    cache = Path("/tmp")
    tc_zip = cache / "gtfs-tc.zip"
    en_zip = cache / "gtfs-en.zip"
    download(TC_URL, tc_zip)
    download(EN_URL, en_zip)
    tc_routes = read_routes(tc_zip)
    en_routes = read_routes(en_zip)
    with zipfile.ZipFile(tc_zip) as archive:
        trips = {}
        with archive.open("trips.txt") as handle:
            for row in csv.DictReader(line.decode("utf-8-sig") for line in handle):
                if row["route_id"] in tc_routes:
                    trips[row["trip_id"]] = row["route_id"]
        trip_stops: dict[str, list[tuple[int, str]]] = defaultdict(list)
        with archive.open("stop_times.txt") as handle:
            for row in csv.DictReader(line.decode("utf-8-sig") for line in handle):
                trip = row["trip_id"]
                if trip not in trips:
                    continue
                trip_stops[trip].append((int(row["stop_sequence"] or 0), row["stop_id"]))
        sequences: dict[str, dict[str, list[str]]] = defaultdict(dict)
        for trip, pairs in trip_stops.items():
            ordered = [stop for _, stop in sorted(pairs)]
            sequences[trips[trip]]["\n".join(ordered)] = ordered
        gtfs_stops = {}
        with archive.open("stops.txt") as handle:
            for row in csv.DictReader(line.decode("utf-8-sig") for line in handle):
                gtfs_stops[row["stop_id"]] = (float(row["stop_lon"]), float(row["stop_lat"]))

    network = json.loads((ROOT / "data/citybus-network.json").read_text())["stops"]
    points = [(stop_id, float(stop["lng"]), float(stop["lat"])) for stop_id, stop in network.items()]
    used = {stop for sequences_for_route in sequences.values() for ordered in sequences_for_route.values() for stop in ordered}
    matched: dict[str, str] = {}
    for gtfs_id in used:
        point = gtfs_stops.get(gtfs_id)
        if not point:
            continue
        best_id = ""
        best = MATCH_METRES
        for stop_id, lng, lat in points:
            distance = metres(point[0], point[1], lng, lat)
            if distance < best:
                best = distance
                best_id = stop_id
        if best_id:
            matched[gtfs_id] = best_id
    print(f"gtfs stops used {len(used)} matched {len(matched)}")

    records = []
    for route_id, paths in sequences.items():
        info = tc_routes[route_id]
        english = en_routes.get(route_id, {}).get("long", "")
        tc_note, tc_place = describe(info["long"])
        en_note, en_place = describe(english)
        api_stops = {matched[gtfs_id] for ordered in paths.values() for gtfs_id in ordered if gtfs_id in matched}
        records.append({
            "short": info["short"],
            "tc_note": tc_note,
            "en_note": en_note,
            "tc_place": tc_place,
            "en_place": en_place,
            "stops": api_stops,
            "count": len(api_stops),
            "raw": info["long"],
        })
    primary: dict[str, str] = {}
    for record in records:
        current = primary.get(record["short"])
        if current is None or record["count"] > current[0]:
            primary[record["short"]] = (record["count"], record["tc_place"])
    by_stop: dict[str, dict[str, list[dict[str, object]]]] = defaultdict(dict)
    for record in records:
        different = bool(record["tc_place"]) and record["tc_place"] != primary[record["short"]][1]
        special = bool(record["tc_note"]) or different or "特別" in record["raw"]
        if record["tc_note"]:
            tc, en = record["tc_note"], record["en_note"] or record["en_place"] or record["tc_place"]
        elif different:
            tc, en = record["tc_place"], record["en_place"] or record["tc_place"]
        else:
            tc, en = record["tc_place"], record["en_place"] or record["tc_place"]
        label = {"tc": tc, "en": en, "special": special}
        for api_id in record["stops"]:
            labels = by_stop[api_id].setdefault(record["short"], [])
            if any(item["tc"] == label["tc"] and item["en"] == label["en"] for item in labels):
                continue
            labels.append(label)

    kept = {}
    for stop_id, routes in by_stop.items():
        useful = {}
        for route, labels in routes.items():
            if len(labels) > 1 or any(item["special"] for item in labels):
                useful[route] = labels
        if useful:
            kept[stop_id] = useful
    target = ROOT / "data/citybus-variants.json"
    target.write_text(json.dumps({"stops": kept}, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {target} stops {len(kept)} bytes {target.stat().st_size}")


if __name__ == "__main__":
    main()
