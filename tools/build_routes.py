"""Builds the route files for the extra routes from OpenStreetMap data (free, needs internet).

For every route it:
  1. asks the free OSRM service for the road line between the two bus stands,
  2. asks the Overpass service for named places and bus stops close to that line,
  3. picks about one stop every few km, and
  4. writes data/route_<id>.geojson in the same format as the Galle - Hikkaduwa route.

Run:  python tools/build_routes.py
"""
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config

UA = {"User-Agent": "YanaBus-student-prototype/0.1"}

# name, bus stand at each end as (lat, lng)
ROUTES = {
    # the extra points keep the line on the coastal main road (A2) instead of the inland expressway
    "galle_matara": ("Galle Bus Stand", (6.03297, 80.21574), "Matara Bus Stand", (5.94738, 80.55654),
                     [(5.9937, 80.3190), (5.9740, 80.4290), (5.9461, 80.4590)]),
    "galle_baddegama": ("Galle Bus Stand", (6.03297, 80.21574), "Baddegama Bus Stand", (6.17248, 80.17811), []),
    "galle_ambalangoda": ("Galle Bus Stand", (6.03297, 80.21574), "Ambalangoda Bus Stand", (6.2367, 80.05457), []),
}


def fetch(url, data=None, timeout=90):
    req = urllib.request.Request(url, data=data, headers=UA)
    return json.load(urllib.request.urlopen(req, timeout=timeout))


OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]


def overpass(data):
    """The free Overpass servers are sometimes busy, so try each one a few times."""
    last = None
    for attempt in range(3):
        for url in OVERPASS:
            try:
                return fetch(url, data, 70)
            except Exception as e:                    # 502 / timeout: wait and try again
                last = e
                time.sleep(4 * (attempt + 1))
    raise last


def haversine_km(a, b):
    lng1, lat1, lng2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def osrm_line(a, b, via=()):
    points = [a, *via, b]
    path = ";".join(f"{p[1]},{p[0]}" for p in points)
    url = f"https://router.project-osrm.org/route/v1/driving/{path}?overview=full&geometries=geojson"
    for attempt in range(4):                          # the free server is sometimes slow
        try:
            return fetch(url, timeout=60)["routes"][0]["geometry"]["coordinates"]
        except Exception:
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("The routing service did not answer. Try again in a minute.")


def latin(name):
    letters = [c for c in name if c.isalpha()]
    return bool(letters) and sum(c.isascii() for c in letters) / len(letters) > 0.8


def candidates(coords):
    """Named places and bus stops within a few hundred metres of the line."""
    # a box around the whole route is much cheaper for the free server than "near this line"
    south = min(p[1] for p in coords) - 0.01
    north = max(p[1] for p in coords) + 0.01
    west = min(p[0] for p in coords) - 0.01
    east = max(p[0] for p in coords) + 0.01
    box = f"{south:.4f},{west:.4f},{north:.4f},{east:.4f}"
    q = ("[out:json][timeout:80];("
         f'node["highway"="bus_stop"]["name"]({box});'
         f'node["amenity"="bus_station"]["name"]({box});'
         f'node["place"~"^(town|village|suburb|hamlet|neighbourhood)$"]["name"]({box});'
         ");out;")
    data = urllib.parse.urlencode({"data": q}).encode()
    out = []
    for e in overpass(data).get("elements", []):
        tags = e.get("tags", {})
        name = tags.get("name:en") or tags.get("name")
        if name and latin(name) and "lat" in e:
            kind = 0 if "place" in tags else 1       # prefer town / village names over plain bus stops
            out.append((name.split(";")[0].strip(), e["lat"], e["lon"], kind))
    return out


def build(route_id, start_name, start, end_name, end, via=()):
    coords = osrm_line(start, end, via)
    cum = [0.0]
    for i in range(1, len(coords)):
        cum.append(cum[-1] + haversine_km(coords[i - 1], coords[i]))
    length = cum[-1]

    snapped = []
    for name, lat, lng, kind in candidates(coords):
        idx = min(range(len(coords)), key=lambda i: haversine_km(coords[i], [lng, lat]))
        off = haversine_km(coords[idx], [lng, lat]) * 1000
        if off <= 600 and 0.8 < cum[idx] < length - 0.8:
            snapped.append((cum[idx], idx, name, kind, off))
    snapped.sort()

    n = max(8, min(14, round(length / 3.2)))                 # roughly one stop every 3 km
    gap = length / (n - 1)
    stops = [(0.0, 0, start_name, 0)]
    for i in range(1, n - 1):
        target = i * gap
        near = [c for c in snapped if abs(c[0] - target) <= gap * 0.45 and c[2] not in {s[2] for s in stops}
                and c[0] - stops[-1][0] >= gap * 0.45 and (length - c[0]) >= gap * 0.45]
        if near:
            best = min(near, key=lambda c: (c[3], abs(c[0] - target)))
            stops.append((best[0], best[1], best[2], 0))
    stops.append((length, len(coords) - 1, end_name, 0))

    features = [{"type": "Feature",
                 "properties": {"kind": "route", "name": f"{start_name.replace(' Bus Stand', '')} - {end_name.replace(' Bus Stand', '')}",
                                "length_km": round(length, 2)},
                 "geometry": {"type": "LineString", "coordinates": coords}}]
    for order, (km, idx, name, _) in enumerate(stops, 1):
        features.append({"type": "Feature",
                         "properties": {"kind": "stop", "order": order, "name": name, "km_from_start": round(km, 2),
                                        "route_index": idx, "offset_m": 0},
                         "geometry": {"type": "Point", "coordinates": coords[idx]}})
    path = config.DATA_DIR / f"route_{route_id}.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, indent=1), encoding="utf-8")
    print(f"\n{route_id}: {length:.1f} km, {len(stops)} stops -> {path.name}")
    for order, (km, idx, name, _) in enumerate(stops, 1):
        print(f"  {order:2} {km:6.1f} km  {name}")


if __name__ == "__main__":
    wanted = sys.argv[1:] or list(ROUTES)          # e.g.  python tools/build_routes.py galle_matara
    for rid in wanted:
        sn, s, en, e, via = ROUTES[rid]
        build(rid, sn, s, en, e, via)
        time.sleep(2)           # be gentle with the free services
