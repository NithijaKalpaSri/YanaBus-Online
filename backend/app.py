"""YanaBus web server: the API the web pages and the phone apps talk to.

There is one simulation per live route. Most passenger endpoints take an optional
?route=<id> (the first route is used when it is left out).
"""
import asyncio
import hmac
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import config
from analytics import Analytics
from route import ROUTES
from sim import Simulation
from world import WORLDS

SIMS = {rid: Simulation(ROUTES[rid], WORLDS[rid]) for rid in ROUTES}
DEFAULT = SIMS[config.DEFAULT_ROUTE_ID]
analytics = Analytics()


def sim_for(route_id):
    """The simulation of a route (the default route when no id is given)."""
    if not route_id:
        return DEFAULT
    sim = SIMS.get(route_id)
    if sim is None:
        raise HTTPException(404, "No such route")
    return sim


def find_bus(bus_id):
    """(simulation, bus) for a number plate, whichever route the bus is on."""
    for sim in SIMS.values():
        bus = sim.find_bus(bus_id)
        if bus is not None:
            return sim, bus
    raise HTTPException(404, "No such bus")


@asynccontextmanager
async def lifespan(app):
    tasks = [asyncio.create_task(sim.run()) for sim in SIMS.values()]    # the buses start moving
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(title="YanaBus", lifespan=lifespan)
# lets the phone apps' web preview (another port) talk to the API; phones themselves do not need it
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
FRONTEND = config.ROOT / "frontend"


# ------------------------------------------------------------------ routes (passenger app)
def _route_summary(sim):
    r = sim.route
    return {"id": r.id, "name": r.name, "from": r.from_name, "to": r.to_name,
            "length_km": round(r.length, 1), "buses": len(sim.buses),
            "trips_running": sum(1 for b in sim.buses if b.trip_active)}


@app.get("/api/routes")
def list_routes():
    """Every live route, with its stop names (the phone app searches these)."""
    return [{**_route_summary(sim), "stops": [s["name"] for s in sim.route.stops]} for sim in SIMS.values()]


@app.get("/api/routes/nearby")
def routes_nearby(lat: float, lng: float):
    """All routes, closest to the phone first, with the nearest stop and the next bus there."""
    out = []
    for sim in SIMS.values():
        loc = sim.locate(lat, lng)
        stop = loc["nearest_stop"]
        etas = sim.stop_etas(stop["id"])
        out.append({**_route_summary(sim),
                    "distance_m": loc["off_route_m"],            # how far the phone is from the road
                    "on_route": loc["on_route"],
                    "nearest_stop": stop,
                    "next_bus": etas[0] if etas else None})
    out.sort(key=lambda r: r["distance_m"])
    return out


@app.get("/api/route")
def get_route(route: str | None = None):
    sim = sim_for(route)
    r = sim.route
    return {
        "id": r.id,
        "name": r.name,
        "from": r.from_name,
        "to": r.to_name,
        "line": [[c[1], c[0]] for c in r.coords],
        "stops": [{"id": s["id"], "name": s["name"], "lat": s["lat"], "lng": s["lng"],
                   "km": round(s["km"], 1)} for s in r.stops],
        "sections": r.seg_names,
    }


@app.get("/api/state")
def get_state(route: str | None = None):
    return sim_for(route).state()


@app.get("/api/stops")
def get_stops(route: str | None = None):
    return sim_for(route).stop_summary()


@app.get("/api/stops/{stop_id}/eta")
def get_stop_eta(stop_id: int, route: str | None = None):
    sim = sim_for(route)
    if not 0 <= stop_id < len(sim.route.stops):
        raise HTTPException(404, "No such stop")
    return {"stop": sim.route.stops[stop_id]["name"], "time": sim.clock_text(),
            "buses": sim.stop_etas(stop_id)}


# ------------------------------------------------------------------ conductor
class Ticket(BaseModel):
    bus_id: str
    to_stop: int


class Crowd(BaseModel):
    bus_id: str
    level: str          # green | orange | red | auto


def _require_trip(bus):
    """The conductor works on a trip the driver has started; conductors never start trips."""
    if not bus.trip_active:
        raise HTTPException(409, "The driver has not started the trip yet.")


@app.post("/api/conductor/ticket")
def issue_ticket(t: Ticket):
    sim, bus = find_bus(t.bus_id)
    _require_trip(bus)
    if not sim.issue_ticket(bus, t.to_stop):
        raise HTTPException(400, "This bus does not stop there, or it is full")
    return sim.bus_info(bus)


@app.post("/api/conductor/crowd")
def set_crowd(c: Crowd):
    sim, bus = find_bus(c.bus_id)
    _require_trip(bus)
    if c.level not in ("green", "orange", "red", "auto"):
        raise HTTPException(400, "Level must be green, orange, red or auto")
    bus.manual_level = None if c.level == "auto" else c.level
    return sim.bus_info(bus)


# ------------------------------------------------------------------ staff app: sign in and location
class Login(BaseModel):
    staff_id: str
    pin: str


def _load_staff():
    """The demo accounts: data/staff.json, or data/staff.example.json when that file does not exist."""
    for path in (config.STAFF_FILE, config.STAFF_EXAMPLE_FILE):
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    return []


@app.post("/api/auth/login")
def login(body: Login):
    """Demo sign in against data/staff.json (a real system would use proper accounts and tokens)."""
    for person in _load_staff():
        if person["id"].lower() == body.staff_id.strip().lower() and hmac.compare_digest(str(person["pin"]), body.pin.strip()):
            return {"id": person["id"], "name": person["name"], "roles": person["roles"]}
    raise HTTPException(401, "Wrong staff ID or PIN")


@app.get("/api/locate")
def locate(lat: float, lng: float):
    """Which route is this phone on (or closest to), and which bus there is nearest?"""
    results = [sim.locate(lat, lng) for sim in SIMS.values()]
    return min(results, key=lambda r: r["off_route_m"])


# ------------------------------------------------------------------ driver app
class DriverStart(BaseModel):
    bus_id: str
    direction: int          # 1 = towards the last stop, -1 = towards the first stop


class DriverFix(BaseModel):
    bus_id: str
    lat: float
    lng: float
    speed_kmh: float | None = None


class DriverStop(BaseModel):
    bus_id: str


@app.post("/api/driver/start")
def driver_start(d: DriverStart):
    sim, bus = find_bus(d.bus_id)
    sim.driver_start(bus, d.direction)
    return sim.bus_info(bus)


@app.post("/api/driver/location")
def driver_location(f: DriverFix):
    sim, bus = find_bus(f.bus_id)
    status = sim.driver_fix(bus, f.lat, f.lng, f.speed_kmh)
    return {"status": status, "off_route_m": bus.off_route_m, "bus": sim.bus_info(bus)}


@app.post("/api/driver/stop")
def driver_stop(d: DriverStop):
    sim, bus = find_bus(d.bus_id)
    sim.driver_stop(bus)
    return sim.bus_info(bus)


# ------------------------------------------------------------------ demo controls
class Hour(BaseModel):
    hour: float


class Incident(BaseModel):
    segment: int
    on: bool
    route: str | None = None


class Running(BaseModel):
    running: bool


@app.post("/api/demo/hour")
def demo_hour(h: Hour):
    for sim in SIMS.values():           # one time of day for every route
        sim.set_hour(h.hour)
    return DEFAULT.state()


@app.post("/api/demo/incident")
def demo_incident(i: Incident):
    sim = sim_for(i.route)
    if not 0 <= i.segment < len(sim.route.seg_len):
        raise HTTPException(400, "No such section")
    sim.set_incident(i.segment, i.on)
    return sim.state()


@app.post("/api/demo/clock")
def demo_clock(r: Running):
    for sim in SIMS.values():
        sim.clock_running = r.running
    return DEFAULT.state()


# ------------------------------------------------------------------ authority dashboard
@app.get("/api/analytics/summary")
def analytics_summary():
    return analytics.summary()


@app.get("/api/analytics/heatmap")
def analytics_heatmap(hour: int = 8):
    return analytics.heatmap(hour)


# ------------------------------------------------------------------ web pages
REACT_BUILD = config.ROOT / "web" / "dist"      # made by `npm run build` in web/

if REACT_BUILD.exists():
    # React app: every page is served by the same index.html
    @app.get("/")
    @app.get("/conductor")
    @app.get("/dashboard")
    def react_page():
        return FileResponse(REACT_BUILD / "index.html")

    app.mount("/", StaticFiles(directory=REACT_BUILD), name="frontend")
else:
    # fallback: the plain HTML pages in frontend/
    @app.get("/")
    def home():
        return FileResponse(FRONTEND / "index.html")

    app.mount("/", StaticFiles(directory=FRONTEND), name="frontend")
