"""Loads the routes (road line and stops) from the GeoJSON files."""
import json
import math

import config


def haversine_km(a, b):
    """Distance in km between two [lng, lat] points."""
    lng1, lat1, lng2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2)
    return 6371 * 2 * math.asin(math.sqrt(h))


class Route:
    def __init__(self, cfg):
        self.id = cfg["id"]
        self.name = cfg["name"]
        self.severity = cfg["severity"]
        self.bus_ids = cfg["buses"]

        with open(cfg["file"], encoding="utf-8") as f:
            features = json.load(f)["features"]

        line = next(x for x in features if x["properties"]["kind"] == "route")
        self.coords = line["geometry"]["coordinates"]          # [lng, lat] points

        # distance from the start for every point on the line
        self.cum_km = [0.0]
        for i in range(1, len(self.coords)):
            self.cum_km.append(self.cum_km[-1]
                               + haversine_km(self.coords[i - 1], self.coords[i]))

        stops = sorted((x for x in features if x["properties"]["kind"] == "stop"),
                       key=lambda x: x["properties"]["order"])
        self.stops = []
        for i, s in enumerate(stops):
            idx = s["properties"]["route_index"]
            self.stops.append({
                "id": i,
                "name": s["properties"]["name"],
                "km": self.cum_km[idx],
                "index": idx,
                "lat": s["geometry"]["coordinates"][1],
                "lng": s["geometry"]["coordinates"][0],
            })

        self.length = self.stops[-1]["km"]
        # section i = the road between stop i and stop i+1
        self.seg_len = [self.stops[i + 1]["km"] - self.stops[i]["km"]
                        for i in range(len(self.stops) - 1)]
        self.seg_names = [f"{self.stops[i]['name']} - {self.stops[i + 1]['name']}"
                          for i in range(len(self.stops) - 1)]

    # names of the two ends, without "Bus Stand"
    @property
    def from_name(self):
        return self.stops[0]["name"].replace(" Bus Stand", "")

    @property
    def to_name(self):
        return self.stops[-1]["name"].replace(" Bus Stand", "")

    def point_at(self, km):
        """(lat, lng) of the point `km` kilometres along the route."""
        km = max(0.0, min(km, self.cum_km[-1]))
        lo, hi = 0, len(self.cum_km) - 1
        while hi - lo > 1:                       # binary search
            mid = (lo + hi) // 2
            if self.cum_km[mid] <= km:
                lo = mid
            else:
                hi = mid
        span = self.cum_km[hi] - self.cum_km[lo]
        t = 0 if span == 0 else (km - self.cum_km[lo]) / span
        lng = self.coords[lo][0] + t * (self.coords[hi][0] - self.coords[lo][0])
        lat = self.coords[lo][1] + t * (self.coords[hi][1] - self.coords[lo][1])
        return lat, lng

    def project(self, lat, lng):
        """Closest point on the route to a GPS position.

        Returns (km along the route, distance from the route in metres).
        Flat-earth maths is accurate enough over distances this small.
        """
        kx = math.cos(math.radians(lat)) * 111.32       # km per degree of longitude
        ky = 110.57                                      # km per degree of latitude
        px, py = lng * kx, lat * ky
        best_d, best_km = float("inf"), 0.0
        for i in range(len(self.coords) - 1):
            ax, ay = self.coords[i][0] * kx, self.coords[i][1] * ky
            bx, by = self.coords[i + 1][0] * kx, self.coords[i + 1][1] * ky
            dx, dy = bx - ax, by - ay
            length2 = dx * dx + dy * dy
            t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2))
            d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d < best_d:
                best_d = d
                best_km = self.cum_km[i] + t * (self.cum_km[i + 1] - self.cum_km[i])
        return best_km, best_d * 1000

    def nearest_stop(self, lat, lng):
        """(stop, distance in metres) of the stop closest to a position."""
        best = min(self.stops, key=lambda s: haversine_km([lng, lat], [s["lng"], s["lat"]]))
        return best, haversine_km([lng, lat], [best["lng"], best["lat"]]) * 1000

    def section_path(self, seg):
        """[lat, lng] points of the road between stop `seg` and stop `seg`+1."""
        a, b = self.stops[seg]["index"], self.stops[seg + 1]["index"]
        return [[c[1], c[0]] for c in self.coords[a:b + 1]]


ROUTES = {cfg["id"]: Route(cfg) for cfg in config.LIVE_ROUTES}
DEFAULT_ID = config.DEFAULT_ROUTE_ID
route = ROUTES[DEFAULT_ID]            # the default route (used by the web pages and the dashboard)
