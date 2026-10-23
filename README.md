# YanaBus

Crowdsourced bus arrival prediction for Galle, Sri Lanka (Emerging Technologies coursework prototype).
The driver's and conductor's phones replace hardware trackers. An AI model turns their GPS and speed into arrival times,
passengers see live buses coloured by how full they are, and the transport authority sees which routes are chronically late.

* Passenger app **YanaBus**, staff app **YanaBus - Drivers** (React Native / Expo)
* Server (Python, FastAPI) with one simulated set of buses and one AI model per route
* Web pages: passenger map and authority dashboard (React + Vite)
* Everything runs on one laptop; phones join over Wi-Fi. Buses and past trips are **simulated**.

Full description, requirements (SRS) and test results: **[docs/SRS.md](docs/SRS.md)**.

## First-time setup

The generated data and the trained models are not stored in Git, so build them once (Python 3.11+ and Node.js 20+):

```
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe ml\generate_history.py      # makes data/history.csv (about 1 minute)
.venv\Scripts\python.exe ml\train_model.py           # trains one AI model per route
cd web && npm install && npm run build && cd ..        # the web pages
cd mobile && npm install && cd ..                      # the phone apps
```

Staff sign in: the server reads `data/staff.json`. If that file does not exist it uses `data/staff.example.json`
(demo accounts S101 to S103). To use your own, copy the example to `data/staff.json` and edit it; that file is not published.

## Run it

```
.venv\Scripts\python.exe run.py
```

The terminal prints the addresses. Open them on the laptop or on phones that are
on the same Wi-Fi / hotspot as the laptop:

| Page | Address |
|---|---|
| Laptop, passenger map with demo controls | `http://localhost:8000/?demo` |
| Phone, passenger view | `http://<laptop-ip>:8000/` |
| Authority dashboard | `http://<laptop-ip>:8000/dashboard` |

The maps load from OpenStreetMap, so the laptop and phones need internet.
If a phone cannot connect, allow Python through the Windows firewall (Private networks).

## The two phone apps (mobile/)

`mobile/` is one React Native (Expo) project that builds two apps. Start each from the `mobile` folder
(first time: `npm install`):

| App | For | Start it |
|---|---|---|
| **YanaBus** | Passengers | `npm run passenger` (port 8082) |
| **YanaBus - Drivers** | Drivers and conductors | `npm run drivers` (port 8081) |

### YanaBus (passengers)
1. The app asks for the phone's location and shows **Routes near you** (for example "Near Dadalla" lists Galle - Hikkaduwa and
   Galle - Ambalangoda), each with the nearest stop, how far it is, and the next bus there with its crowd level.
2. Or **search** a route or a stop by name ("Matara", "Koggala"). If location is off, all routes are listed.
3. Tap a route: a **live map** shows the buses. Each bus pin shows the number of people on board and its colour tells how full it is:
   **green** = seats available, **yellow** = no seats but standing room, **red** = full.
   Tap a stop on the map to see when the next buses arrive; tap a bus card to find it on the map.

### YanaBus - Drivers
1. **Sign in** with a staff ID and PIN. The demo accounts are in `data/staff.json` (or `data/staff.example.json`); the server checks them.
2. **Choose your role**: Driver or Conductor. The app asks for the phone's location and checks it against the routes.
3. **Choose your route** (the route you are on is suggested), then **choose your bus** (the nearest bus is suggested first).
4. **Driver**: starts a trip and shares the bus location and speed. If the phone is on the road the app picks **Real phone GPS**;
   anywhere else it picks **Demo GPS** (the phone drives the route by itself, with a "Traffic jam" button). You can change it.
   **Conductor**: never starts a trip. Until the driver of the chosen bus taps **Start trip**, the screen says
   "Waiting for the driver". When the driver starts, the screen switches by itself to **Trip in progress**: the direction,
   the people on board, the next stop, the *Seats available / Standing room / Full* buttons and the ticket form.
   When the driver ends the trip (or stops sending GPS for 20 s) it goes back to waiting. A new trip starts with an empty bus.
5. **Switch role** and **Sign out** are at the top of the screens. The driver and the conductor of the same bus must choose the
   same bus number plate.

### Running them on a phone or in the emulator
1. Install **Expo Go** from the Play Store (or App Store). Phone and laptop must be on the same Wi-Fi.
2. Open Expo Go and tap the app in its list, or choose "Enter URL manually" and type `exp://<laptop-ip>:8082` (YanaBus)
   or `exp://<laptop-ip>:8081` (YanaBus - Drivers).
3. The apps find the YanaBus server on the laptop by themselves. The green "Online" pill shows it is connected;
   tap it to check or change the address.

Android 16 and newer block apps from reaching other computers on the network until you allow it.
If Expo Go shows **"Local network access needed"** on its home screen (or an app says "Failed to download remote update"),
tap that banner and choose **Allow**.

To use the Android Studio emulator instead of a phone: install Expo Go in it, allow local network access as above
(or `adb shell pm grant host.exp.exponent android.permission.ACCESS_LOCAL_NETWORK`), then open `exp://10.0.2.2:8082`
(YanaBus) or `exp://10.0.2.2:8081` (YanaBus - Drivers). `10.0.2.2` is the emulator's name for the laptop. To test "routes near
you", set a position on the road in the emulator's Extended controls ("..." button, then Location), for example
`6.0715, 80.1637` (near Boossa) or Dadalla `6.0467, 80.1922`. Without a position the passenger app shows all routes and search.

To try the Drivers app in a browser without a phone: `npm run drivers:web`.
Windows may ask to allow Node.js through the firewall (Private networks) so the phone can reach ports 8081, 8082 and 8000.

### Routes
There are four live routes (each with 6 simulated buses and its own AI model): Galle - Hikkaduwa, Galle - Matara,
Galle - Baddegama and Galle - Ambalangoda. They are listed in `config.py` (`LIVE_ROUTES`). The road lines and stops of the last
three were made from OpenStreetMap by `tools/build_routes.py` (needs internet; check the stop names afterwards). After adding or
changing a route, run the two ML scripts in the next section.

## The React app (web/)

The pages are a React + Vite app in `web/`. The Python server serves the built
version from `web/dist`, so the demo only needs `python run.py`.

After changing anything in `web/src`, rebuild it:

```
cd web
npm install        (first time only)
npm run build
```

While editing you can use `npm run dev` (port 5173, talks to the Python server on 8000).
The old plain-HTML pages in `frontend/` are only used if `web/dist` does not exist.

## Rebuild the data and AI model (only if you change `config.py`)

```
.venv\Scripts\python.exe ml\generate_history.py
.venv\Scripts\python.exe ml\train_model.py
```

## Demo flow

1. Laptop at 14:00 (off-peak): short ETAs, green buses.
2. Press **08:00 Morning peak**: trips get longer, buses fill up.
3. Tap a stop: next buses, minutes, crowd level.
4. On the conductor phone: **Issue ticket** or set the crowd level. The laptop map updates.
5. Add a **jam** on a section: ETAs grow and the alert banner appears.
6. Open the dashboard: late routes, delay by hour, slowest sections, accuracy of the AI, heatmap.

## Files

| Path | What it does |
|---|---|
| `config.py` | All settings (timings, buses, seats, other routes) |
| `route.py`, `world.py` | Route and stops; the rules for how slow each section is |
| `ml/generate_history.py` | Makes the past-trip data (Big Data) |
| `ml/train_model.py` | Trains one AI model per route and measures its accuracy |
| `tools/build_routes.py` | Makes the road line and stops of a route from OpenStreetMap |
| `backend/sim.py` | Simulated buses, tickets, crowd levels, ETA calculation |
| `backend/predictor.py` | Uses the AI model |
| `backend/analytics.py` | Analyses the history data for the dashboard |
| `backend/app.py` | The web API |
| `mobile/src/passenger/` | The passenger app YanaBus: home (nearby routes, search), live route map |
| `mobile/src/Root.js`, `Login.js`, `RoleSelect.js`, `RouteSelect.js` | The Drivers app's flow: sign in, role, route |
| `mobile/src/DriverApp.js`, `mobile/src/ConductorApp.js` | The driver and conductor screens (React Native / Expo) |
| `data/staff.json` | Demo staff accounts for the app's sign in |
| `web/src/pages/` | Passenger, conductor and dashboard pages (React) |
| `web/src/components/`, `web/src/styles.css` | Shared map, badges, icons and the design |
| `frontend/` | Old plain-HTML version (fallback only) |
