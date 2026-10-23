"""Simulated buses driving along one route (stands in for conductor phones).

Each bus behaves like a phone would: it reports its position and how fast it
is going. The simulator also creates the tickets a conductor would issue.
There is one Simulation per live route.
"""
import asyncio
import math
import random
import time

import config
from predictor import Predictor
from world import FREE_SPEED_KMH, mode_name, peak_intensity

DOW = 2                              # the simulated day is a Wednesday
LIVE_REPORT_MAX_AGE_MIN = 20         # ignore speed reports older than this (sim minutes)

BOARD_BASE = 3.0                     # average people boarding at a normal stop, free road
BOARD_PEAK_EXTRA = 9.0               # extra people boarding at the height of the rush

CROWD_LABELS = {
    "green": "Seats available",
    "orange": "Standing room",       # shown in yellow: no seats left, but you can stand
    "red": "Full",
}

# Driver phones
PHONE_TIMEOUT_S = 20                 # no GPS for this long (real seconds) -> the simulator drives the bus again
OFF_ROUTE_MAX_M = 500                # a GPS fix further than this from the route is ignored
MIN_MOVING_KMH = 3                   # slower than this counts as stopped (traffic light, bus stop)


def crowd_level(count):
    if count < config.SEATS:
        return "green"               # there are still seats
    if count < config.CROWD_FULL_AT:
        return "orange"              # standing room only (yellow)
    return "red"                     # full


def poisson(lam):
    """Random whole number around `lam` (people arriving)."""
    limit, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= random.random()
        if p <= limit:
            return k
        k += 1


class Bus:
    def __init__(self, route, bus_id, direction, km):
        self.route = route
        self.id = bus_id
        self.direction = direction          # +1 = from the first stop to the last, -1 = back
        self.passengers = []                # one entry per ticket: the stop id to get off at
        self.manual_level = None            # set by the conductor's crowd buttons
        n = len(route.stops)
        # find the section the bus starts in
        seg = max(0, min(n - 2, next(
            (i for i in range(n - 1) if route.stops[i + 1]["km"] >= km), n - 2)))
        self.prev_stop = seg if direction == 1 else seg + 1
        self.next_stop = self.prev_stop + direction
        a, b = route.stops[self.prev_stop]["km"], route.stops[self.next_stop]["km"]
        self.frac = min(1.0, max(0.0, (km - a) / (b - a)))
        self.t_act = 1.0                    # real minutes this bus needs for its section
        # set while a driver's phone is sharing GPS for this bus
        self.phone_until = 0.0              # time.monotonic() deadline, renewed by every GPS fix
        self.was_phone = False
        self.gps_speed = None               # km/h reported by the phone
        self.gps_ratio = None               # how many times slower than free road, from that speed
        self.off_route_m = 0
        self.first_fix = False
        # a trip exists from the moment the driver starts it until the driver ends it (or stops sending GPS)
        self.trip_active = False
        self.trip_started = None            # clock text when the driver started, e.g. "14:05"

    @property
    def phone_active(self):
        return time.monotonic() < self.phone_until

    @property
    def seg(self):
        return min(self.prev_stop, self.next_stop)

    @property
    def km(self):
        a, b = self.route.stops[self.prev_stop]["km"], self.route.stops[self.next_stop]["km"]
        return a + (b - a) * self.frac

    @property
    def speed_kmh(self):
        if self.phone_active and self.gps_speed is not None:
            return self.gps_speed
        return self.route.seg_len[self.seg] / self.t_act * 60

    def level(self):
        return self.manual_level or crowd_level(len(self.passengers))


class Simulation:
    def __init__(self, route, world):
        self.route = route
        self.world = world
        self.n_stops = len(route.stops)
        self.last = self.n_stops - 1
        # how busy each stop is (the two bus stands and every third stop are busier)
        self.stop_demand = [3.0] + [1.3 if i % 3 == 0 else 1.0 for i in range(1, self.last)] + [3.0]

        self.predictor = Predictor(world)
        self.clock_min = config.START_HOUR * 60      # simulated time of day, in minutes
        self.clock_running = False
        self.incidents = {}                          # section -> how many times slower
        self.live = [None] * world.n_seg             # section -> (ratio, clock_min)
        self.buses = []
        self.section_min = world.base_min[:]
        self.alert = None
        self.trip_now = sum(world.base_min)
        self.trip_usual = sum(world.base_min)
        self._spawn_buses()
        for bus in self.buses:
            bus.t_act = self._draw_time(bus.seg)
        self._predict()

    # ---------------------------------------------------------------- setup
    def _spawn_buses(self):
        per_way = len(self.route.bus_ids) // 2
        for i, bus_id in enumerate(self.route.bus_ids):
            direction = 1 if i < per_way else -1
            slot = i % per_way
            # spread the buses along the route; the two directions are offset
            offset = 0.3 if direction == 1 else 0.75
            km = self.route.length * (slot + offset) / per_way
            bus = Bus(self.route, bus_id, direction, km)
            ahead = self._stops_ahead(bus.next_stop, direction)
            for _ in range(random.randint(8, 30)):
                if ahead:
                    bus.passengers.append(random.choice(ahead))
            self.buses.append(bus)

    def _stops_ahead(self, stop, direction):
        """Stops the bus still visits, starting from `stop`, in its direction of travel."""
        return list(range(stop, self.n_stops)) if direction == 1 else list(range(0, stop + 1))

    def heading_name(self, bus):
        """Where the bus is going (the name of the last stop in its direction)."""
        return self.route.stops[self.last if bus.direction == 1 else 0]["name"]

    # ---------------------------------------------------------------- time
    @property
    def hour(self):
        return (self.clock_min / 60) % 24

    def _weekend(self):
        return DOW >= 5

    def clock_text(self):
        m = int(self.clock_min) % 1440
        return f"{m // 60:02d}:{m % 60:02d}"

    def set_hour(self, hour):
        self.clock_min = hour * 60
        self.live = [None] * self.world.n_seg        # old speed reports are out of date
        rush = peak_intensity(self.hour, self._weekend())
        for bus in self.buses:
            bus.t_act = self._draw_time(bus.seg)
            # jumping to another time of day: loads typical for that hour
            ahead = self._stops_ahead(bus.next_stop, bus.direction)
            n = min(config.MAX_LOAD, int(random.uniform(0.5, 1.4) * (14 + 52 * rush)))
            bus.passengers = [random.choice(ahead) for _ in range(n)]
            bus.manual_level = None
        self._predict()

    # ---------------------------------------------------------------- real-world rules
    def _draw_time(self, seg):
        """How long a bus really takes on this section right now."""
        t = self.world.base_min[seg] * self.world.congestion(seg, self.hour, self._weekend())
        t *= self.incidents.get(seg, 1.0)
        return t * random.lognormvariate(0, 0.05)

    def set_incident(self, seg, on):
        if on:
            self.incidents[seg] = 2.6
            # phones of people stuck in the jam report it straight away
            normal = self.world.congestion(seg, self.hour, self._weekend())
            self.live[seg] = (normal * 2.6, self.clock_min)
            for bus in self.buses:            # buses already on that section slow down
                if bus.seg == seg:
                    bus.t_act *= 2.6
        else:
            self.incidents.pop(seg, None)
            for bus in self.buses:
                if bus.seg == seg:
                    bus.t_act = self._draw_time(seg)
        self._report_speeds()
        self._predict()

    # ---------------------------------------------------------------- movement
    async def run(self):
        dt_real = config.TICK_SECONDS
        while True:
            await asyncio.sleep(dt_real)
            self.tick(dt_real * config.SIM_SPEED / 60)     # simulated minutes

    def tick(self, dt_min):
        if self.clock_running:
            self.clock_min += dt_min
        for bus in self.buses:
            if bus.phone_active:
                continue                              # a real phone is driving this bus
            if bus.was_phone:                         # phone stopped sending: the trip is over, simulator takes over again
                bus.was_phone = False
                bus.trip_active = False
                bus.gps_speed = bus.gps_ratio = None
                bus.t_act = self._draw_time(bus.seg)
            self._move(bus, dt_min)
        self._report_speeds()
        self._predict()

    def _move(self, bus, dt_min):
        remaining = dt_min
        while remaining > 0:
            left = (1 - bus.frac) * bus.t_act
            if remaining < left:
                bus.frac += remaining / bus.t_act
                return
            remaining -= left
            self._arrive(bus)

    def _arrive(self, bus):
        """The bus reaches its next stop: people get off, new tickets are issued."""
        stop = bus.next_stop
        bus.prev_stop = stop
        bus.frac = 0.0
        bus.manual_level = None                       # conductor re-checks at every stop
        terminal = stop in (0, self.last)
        if terminal:
            bus.direction = 1 if stop == 0 else -1
            bus.passengers = []
        else:
            bus.passengers = [p for p in bus.passengers if p != stop]
        bus.next_stop = stop + bus.direction

        # new passengers buy tickets (destination = a stop further along)
        ahead = self._stops_ahead(bus.next_stop, bus.direction)
        rush = peak_intensity(self.hour, self._weekend())
        demand = self.stop_demand[stop] * (BOARD_BASE + BOARD_PEAK_EXTRA * rush)
        for _ in range(poisson(demand)):
            if len(bus.passengers) >= config.MAX_LOAD:
                break
            bus.passengers.append(random.choice(ahead))
        bus.t_act = self._draw_time(bus.seg)

    def _report_speeds(self):
        """Every bus phone reports how slow its section is right now."""
        for bus in self.buses:                        # simulated buses first...
            if not bus.phone_active:
                self.live[bus.seg] = (bus.t_act / self.world.base_min[bus.seg], self.clock_min)
        for bus in self.buses:                        # ...so a real phone's report wins on the same section
            if bus.phone_active and bus.gps_ratio is not None:
                self.live[bus.seg] = (bus.gps_ratio, self.clock_min)

    # ---------------------------------------------------------------- AI prediction
    def _predict(self):
        recent = [None if r is None or self.clock_min - r[1] > LIVE_REPORT_MAX_AGE_MIN
                  else r[0] for r in self.live]
        recent = self._spread_jams(recent)
        self.section_min = self.predictor.section_minutes(self.hour, DOW, recent)
        usual = self.predictor.usual_minutes(self.hour, self._weekend())
        self.trip_now = sum(self.section_min)
        self.trip_usual = sum(usual)
        late = self.trip_now - self.trip_usual
        self.alert = (f"Buses are running about {late:.0f} min slower than usual on this route."
                      if late >= 5 else None)

    def _spread_jams(self, reports):
        """A slow report also slows the sections next to it (half as much per section, two each way).

        Traffic jams are not limited to one road section, so a bus stuck in one
        should also raise the predicted times of the sections around it.
        """
        out = list(reports)
        for s, r in enumerate(reports):
            if r is None or r <= 1:
                continue
            for d in (1, 2):
                for n in (s - d, s + d):
                    if 0 <= n < len(out) and reports[n] is None:
                        spread = 1 + (r - 1) * 0.5 ** d
                        usual = self.predictor.usual_ratio(n, self.hour, self._weekend())
                        out[n] = max(out[n] or 0, spread, usual)
        return out

    def eta_to(self, bus, stop):
        """Predicted minutes until `bus` reaches `stop`, or None if it has already passed it."""
        if bus.direction == 1:
            if stop < bus.next_stop:
                return None
            minutes = (1 - bus.frac) * self.section_min[bus.seg]
            minutes += sum(self.section_min[k] for k in range(bus.next_stop, stop))
        else:
            if stop > bus.next_stop:
                return None
            minutes = (1 - bus.frac) * self.section_min[bus.seg]
            minutes += sum(self.section_min[k] for k in range(stop, bus.next_stop))
        return minutes

    # ---------------------------------------------------------------- what the apps see
    def bus_info(self, bus):
        lat, lng = self.route.point_at(bus.km)
        level = bus.level()
        heading = self.heading_name(bus)
        return {
            "id": bus.id,
            "route_id": self.route.id,
            "lat": lat, "lng": lng,
            "direction": bus.direction,
            "heading": heading,
            "direction_label": heading.replace(" Bus Stand", ""),
            "passengers": len(bus.passengers),
            "seats": config.SEATS,
            "crowd": level,
            "crowd_label": CROWD_LABELS[level],
            "next_stop": self.route.stops[bus.next_stop]["name"],
            "next_stop_id": bus.next_stop,
            "eta_next_min": round(self.eta_to(bus, bus.next_stop), 1),
            "speed_kmh": round(bus.speed_kmh, 1),
            "live_gps": bus.phone_active,
            "trip_active": bus.trip_active,
            "trip_started": bus.trip_started,
        }

    def state(self):
        rush = peak_intensity(self.hour, self._weekend())
        return {
            "route_id": self.route.id,
            "route_name": self.route.name,
            "time": self.clock_text(),
            "hour": round(self.hour, 2),
            "clock_running": self.clock_running,
            "mode": mode_name(self.hour, self._weekend()),
            "rush": round(rush, 2),
            "trip_min_now": round(self.trip_now, 1),
            "trip_min_offpeak": round(sum(self.world.base_min)),
            "alert": self.alert,
            "incidents": [{"segment": s, "name": self.route.seg_names[s]} for s in self.incidents],
            "buses": [self.bus_info(b) for b in self.buses],
        }

    def stop_etas(self, stop):
        out = []
        for bus in self.buses:
            m = self.eta_to(bus, stop)
            if m is None:
                continue
            level = bus.level()
            out.append({"bus": bus.id,
                        "heading": self.heading_name(bus),
                        "eta_min": round(m, 1),
                        "crowd": level, "crowd_label": CROWD_LABELS[level],
                        "passengers": len(bus.passengers)})
        out.sort(key=lambda x: x["eta_min"])
        return out

    def stop_summary(self):
        """Every stop with the next bus coming to it (for the stop list)."""
        out = []
        for stop in self.route.stops:
            etas = self.stop_etas(stop["id"])
            nxt = etas[0] if etas else None
            out.append({"id": stop["id"], "name": stop["name"], "km": round(stop["km"], 1),
                        "next_eta_min": nxt["eta_min"] if nxt else None,
                        "crowd": nxt["crowd"] if nxt else None,
                        "crowd_label": nxt["crowd_label"] if nxt else None,
                        "heading": nxt["heading"] if nxt else None})
        return out

    # ---------------------------------------------------------------- driver phone
    def _place(self, bus, km):
        """Put the bus `km` along the route (used when a phone reports its position)."""
        route, n = self.route, self.n_stops
        km = min(max(km, 0.0), route.length)
        seg = max(0, min(n - 2, next(
            (i for i in range(n - 1) if route.stops[i + 1]["km"] >= km), n - 2)))
        a, b = route.stops[seg]["km"], route.stops[seg + 1]["km"]
        f = (km - a) / (b - a)
        if bus.direction == 1:
            bus.prev_stop, bus.next_stop, bus.frac = seg, seg + 1, f
        else:
            bus.prev_stop, bus.next_stop, bus.frac = seg + 1, seg, 1 - f

    def _phone_stop(self, bus, stop):
        """The phone-driven bus has passed a stop: people get off and tickets are issued."""
        bus.manual_level = None
        if stop in (0, self.last):
            bus.passengers = []
        else:
            bus.passengers = [p for p in bus.passengers if p != stop]
        nxt = stop + bus.direction
        ahead = self._stops_ahead(nxt, bus.direction) if 0 <= nxt < self.n_stops else []
        rush = peak_intensity(self.hour, self._weekend())
        for _ in range(poisson(self.stop_demand[stop] * (BOARD_BASE + BOARD_PEAK_EXTRA * rush))):
            if ahead and len(bus.passengers) < config.MAX_LOAD:
                bus.passengers.append(random.choice(ahead))

    def driver_start(self, bus, direction):
        bus.direction = 1 if direction >= 0 else -1
        self._place(bus, bus.km)                      # keep the bus where it is, facing the chosen way
        bus.phone_until = time.monotonic() + PHONE_TIMEOUT_S
        bus.was_phone = True
        bus.first_fix = True
        bus.gps_speed = bus.gps_ratio = None
        bus.off_route_m = 0
        # a new trip starts empty; the conductor's screen switches to "trip in progress" by itself
        bus.trip_active = True
        bus.trip_started = self.clock_text()
        bus.passengers = []
        bus.manual_level = None

    def driver_fix(self, bus, lat, lng, speed_kmh):
        """One GPS position from the driver's phone. Returns 'ok' or 'off_route'."""
        bus.phone_until = time.monotonic() + PHONE_TIMEOUT_S
        bus.was_phone = True
        if not bus.trip_active:                       # e.g. the server was restarted during a trip
            bus.trip_active = True
            bus.trip_started = self.clock_text()
        km, off = self.route.project(lat, lng)
        bus.off_route_m = round(off)
        if off > OFF_ROUTE_MAX_M:
            return "off_route"

        old_prev = bus.prev_stop
        self._place(bus, km)
        if bus.first_fix:
            self._phone_stop(bus, bus.prev_stop)      # people board at the stop the trip starts from
        else:                                         # stops passed since the last fix
            step = bus.direction
            crossed = range(old_prev + step, bus.prev_stop + step, step)
            for stop in crossed:
                self._phone_stop(bus, stop)
        bus.first_fix = False

        if speed_kmh is not None:
            bus.gps_speed = max(0.0, speed_kmh)
            if speed_kmh >= MIN_MOVING_KMH:           # a stopped bus says nothing about the traffic
                bus.gps_ratio = min(6.0, max(0.8, FREE_SPEED_KMH / speed_kmh))
        self._report_speeds()
        self._predict()
        return "ok"

    def driver_stop(self, bus):
        bus.phone_until = 0.0
        bus.trip_active = False
        bus.trip_started = None

    def locate(self, lat, lng):
        """Where is this phone compared with this route, and which bus is closest to it?"""
        km, off = self.route.project(lat, lng)
        on_route = off <= OFF_ROUTE_MAX_M
        stop, stop_m = self.route.nearest_stop(lat, lng)
        result = {"route_id": self.route.id, "route_name": self.route.name,
                  "on_route": on_route, "off_route_m": round(off),
                  "near_stop": stop["name"] if on_route else None,
                  "nearest_stop": {"id": stop["id"], "name": stop["name"], "distance_m": round(stop_m)},
                  "nearest_bus": None}
        if on_route:
            bus = min(self.buses, key=lambda b: abs(b.km - km))
            distance = abs(bus.km - km) * 1000
            if distance <= 1000:
                result["nearest_bus"] = {"id": bus.id, "distance_m": round(distance)}
        return result

    # ---------------------------------------------------------------- conductor actions
    def find_bus(self, bus_id):
        return next((b for b in self.buses if b.id == bus_id), None)

    def issue_ticket(self, bus, to_stop):
        ahead = self._stops_ahead(bus.next_stop, bus.direction)
        if to_stop not in ahead:
            return False
        if len(bus.passengers) >= config.MAX_LOAD:
            return False
        bus.passengers.append(to_stop)
        bus.manual_level = None
        return True
