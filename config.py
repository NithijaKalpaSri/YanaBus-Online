"""All the settings for YanaBus in one place. Change a value here and re-run."""
from pathlib import Path

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
MODEL_DIR = ROOT / "models"

STAFF_FILE = DATA_DIR / "staff.json"          # your demo driver / conductor accounts (not published to GitHub)
STAFF_EXAMPLE_FILE = DATA_DIR / "staff.example.json"   # used when staff.json does not exist
HISTORY_FILE = DATA_DIR / "history.csv"

# ---- Routes with live (simulated) buses -------------------------------------------------
# The first route is the default one (the web pages show it). Route files are made by
# tools/build_routes.py (or by hand for the first route). `severity` = how much worse the
# route gets at rush hour; `buses` = number plates of the 6 buses on the route.
LIVE_ROUTES = [
    {"id": "galle-hikkaduwa", "name": "Galle - Hikkaduwa", "file": DATA_DIR / "route_galle_hikkaduwa.geojson",
     "severity": 1.0,
     "buses": ["SP NB-4521", "SP NC-7733", "SP NA-1096", "SP NB-8820", "SP ND-3354", "SP NC-2417"]},
    {"id": "galle-matara", "name": "Galle - Matara", "file": DATA_DIR / "route_galle_matara.geojson",
     "severity": 0.6,
     "buses": ["SP NA-3302", "SP NB-6158", "SP NC-9041", "SP ND-1277", "SP NA-5586", "SP NB-2640"]},
    {"id": "galle-baddegama", "name": "Galle - Baddegama", "file": DATA_DIR / "route_galle_baddegama.geojson",
     "severity": 0.5,
     "buses": ["SP NC-4417", "SP ND-8803", "SP NA-7712", "SP NB-3395", "SP NC-1924", "SP ND-6068"]},
    {"id": "galle-ambalangoda", "name": "Galle - Ambalangoda", "file": DATA_DIR / "route_galle_ambalangoda.geojson",
     "severity": 0.9,
     "buses": ["SP NA-8864", "SP NB-1503", "SP NC-6279", "SP ND-4931", "SP NA-2058", "SP NB-7716"]},
]
DEFAULT_ROUTE_ID = LIVE_ROUTES[0]["id"]
ROUTE_NAME = LIVE_ROUTES[0]["name"]
ROUTE_FILE = LIVE_ROUTES[0]["file"]


def model_dir(route_id):
    """Where the trained AI model of a route is saved."""
    return MODEL_DIR / route_id


# ---- Timings (estimates, change with real values) ----
OFFPEAK_TRIP_MIN = 40        # end-to-end trip time of the FIRST route on a free road; it also sets the free road speed
MORNING_PEAK_HOUR = 7.75     # centre of the morning rush (about 7:45)
EVENING_PEAK_HOUR = 17.75    # centre of the evening rush (about 17:45)
WEEKEND_PEAK_FACTOR = 0.4    # weekends are less congested

# How badly each road section of the first route slows down at rush hour (Galle town is the worst).
# The other routes use a similar pattern made from their number of sections.
SECTION_SENSITIVITY = [0.9, 0.9, 0.8, 0.5, 0.4, 0.3, 0.3, 0.3, 0.4, 0.5, 0.6]

# ---- Simulator ----
SIM_SPEED = 5                # 1 real second = 5 simulated seconds
TICK_SECONDS = 0.5           # how often the simulator moves the buses
START_HOUR = 14.0            # demo starts in the off-peak afternoon
SEATS = 50
MAX_LOAD = 70                # passengers (seated + standing) a bus can hold

# ---- Crowd level (passengers on board) ----
#   green  = fewer people than seats                -> seats available
#   yellow = no seats left, but there is standing room
#   red    = full, no room for more people
CROWD_FULL_AT = 65

# ---- Historical (generated) data for the Big Data part ----
HISTORY_DAYS = 60
HISTORY_START_DATE = "2026-07-01"
FIRST_TRIP_HOUR = 5.0        # trips are generated every 10 min from 5:00
TRIP_GAP_MIN = 10
TRIPS_PER_DAY = 102          # 5:00 .. 21:50
RANDOM_SEED = 42

# Routes that only appear in the authority dashboard (no live buses).
# Each section: (name, distance km, normal minutes, rush-hour sensitivity)
OTHER_ROUTES = {
    "Galle - Colombo (A2)": {"severity": 1.3, "sections": [
        ("Galle-Hikkaduwa", 19, 40, 0.5), ("Hikkaduwa-Ambalangoda", 18, 34, 0.6),
        ("Ambalangoda-Kalutara", 50, 85, 0.8), ("Kalutara-Panadura", 14, 30, 1.1),
        ("Panadura-Moratuwa", 14, 35, 1.4), ("Moratuwa-Colombo Fort", 18, 50, 1.6)]},
}

# ---- Server ----
HOST = "0.0.0.0"
PORT = 8000
