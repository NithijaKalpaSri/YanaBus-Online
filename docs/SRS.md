# YanaBus: what we built, and the Software Requirements Specification (SRS)

> **About this document.** It is the technical record of the prototype: what exists, how it works and what it must do.
> It is not the coursework report. The course says the report must not use AI tools, so the team has to write the
> report in its own words (problem research, comparison with existing apps, benefits and so on) and can use the facts
> here as reference.

Contents: 1 Introduction, 2 Everything we built, 3 Architecture, 4 Requirements, 5 Interfaces and data,
6 Non-functional requirements, 7 Emerging technologies, 8 Verification, 9 Limitations and future work.

---

## 1. Introduction

### 1.1 Purpose
YanaBus predicts **when the next bus will arrive and how full it is**, using the **phones of drivers and conductors**
instead of hardware trackers. It also gives the **transport authority** a view of which routes and road sections are
chronically late.

### 1.2 The problem and the idea
Buses in Sri Lanka's towns are often private and have no GPS tracker, so passengers do not know when a bus will come or
whether there will be a seat, and the authority has no data on delays. YanaBus replaces the tracker with the **driver's
phone** (position and speed) and the **conductor's phone** (tickets and how full the bus is). An AI model turns that into
arrival times, and the history of trips becomes Big Data for the authority.

### 1.3 Scope
| | Prototype (this repository) | Full system (future) |
|---|---|---|
| Buses | 24 **simulated** buses on 4 routes; a real phone can take over any of them | Real buses |
| Driver GPS | Real phone GPS, or a **Demo GPS** that drives the route | Real phone GPS |
| Tickets and crowd | Random boarding in the simulation; the conductor app can issue tickets and set the crowd level | Digital tickets from the conductor app |
| Past trips | **Generated** data (269,280 records) | Months of real trips |
| Hosting | Runs on one laptop; phones join over Wi-Fi | Cloud server |
| Sign in | Demo accounts in a file | Real accounts and tokens |

### 1.4 Definitions
| Term | Meaning |
|---|---|
| Route | A bus line, for example Galle - Matara, with a road line and a list of stops |
| Section | The road between two neighbouring stops. The AI predicts the time of each section |
| ETA | Estimated time of arrival (in minutes) |
| Trip | One run of one bus, started by its driver and ended by its driver |
| Crowd level | green = seats available, yellow = no seats but standing room, red = full |
| Demo GPS | The driver app drives the route by itself (5 times faster than real time) |
| Expo Go | A free app that runs the phone apps during development |

---

## 2. Everything we built

### 2.1 Route data (4 live routes)
| Route | Length | Stops | Buses |
|---|---|---|---|
| Galle - Hikkaduwa | 18.7 km | 12 | 6 |
| Galle - Matara (coastal road) | 46.9 km | 13 | 6 |
| Galle - Baddegama | 19.2 km | 7 | 6 |
| Galle - Ambalangoda | 31.4 km | 10 | 6 |

Each route is a GeoJSON file in `data/` (the road line and the stops with their distance from the start). The first route was
made from OpenStreetMap bus stops. The other three are made by `tools/build_routes.py`, which asks the free OSRM service for
the road line between the two bus stands (with extra points to keep Galle - Matara on the coast, not the expressway) and the
Overpass service for named places and bus stops near the line, then picks about one stop every 3 km.
A fifth route, Galle - Colombo (A2), exists only as history data for the dashboard.

### 2.2 The simulation (`backend/sim.py`, `world.py`)
- One `Simulation` per route. A tick every 0.5 s moves every bus; 1 real second is 5 simulated seconds.
- How long a bus takes on a section = normal time x congestion (rush-hour curve with a morning peak near 07:45 and an evening
  peak near 17:45, weaker at weekends) x random noise x any jam that has been added.
- Normal speed is 28 km/h, so the Galle - Hikkaduwa trip takes 40 min on a free road and about 58 min at the height of the rush.
- Passengers (section 2.8) and bus positions are updated on every stop.

### 2.3 The AI arrival-time model (`ml/`, `backend/predictor.py`)
- A **Random Forest** (scikit-learn, 120 trees) per route predicts how many times slower than normal a section is.
  Inputs: section, hour, day of week, weekend flag, and **how slow the previous bus was on that section** (the crowdsourced input).
- The ETA of a bus at a stop = the rest of its current section + the predicted time of every section up to the stop.
- Tested on the last 10 days, which the model never saw. Average error of a whole trip, in minutes:

| Route | AI model | History average | Normal timetable |
|---|---|---|---|
| Galle - Hikkaduwa | **1.3** | 2.4 | 5.8 |
| Galle - Matara | **3.0** | 5.2 | 10.1 |
| Galle - Baddegama | **1.6** | 2.6 | 3.9 |
| Galle - Ambalangoda | **2.2** | 3.9 | 8.4 |

### 2.4 Crowdsourced input from phones
- A driver phone sends position and speed. The server snaps the position onto the route, moves the bus, and turns the speed into a
  "how slow is this section" number (free-road speed divided by the reported speed).
- A slow report **spreads** to the two sections on each side (half as strong per section), because a jam is not limited to one section.
  Reports older than 20 simulated minutes are ignored. A real phone's report beats a simulated bus's report on the same section.
- When the prediction for a whole trip is 5 or more minutes worse than usual, passengers see a delay banner.

### 2.5 Big Data and the authority dashboard (`ml/generate_history.py`, `backend/analytics.py`, `web/`)
- `generate_history.py` makes 60 days of trips (a trip every 10 min from 05:00 to 21:50) for the 5 routes: **269,280 section
  records, 30,600 trips**, with slow traffic changes and random jams.
- The dashboard (`/dashboard`) shows: routes that are late most often (a trip is late if it is more than 30% slower than normal),
  delay by hour of the day, the five slowest road sections, the accuracy of the AI model, and a speed heatmap of the road by hour.

### 2.6 The server (`backend/app.py`, FastAPI)
One Python server with a JSON API (section 5.1), a staff sign-in check, route and location look-ups, and the web pages.
The phone apps and the web pages all talk to this server over Wi-Fi.

### 2.7 Web pages (`web/`, React + Vite)
- **Passenger map** (`/`, add `?demo` for demo controls): full-screen map, a stop list with the next bus at every stop, a bus
  detail card, and a **Demo controls** panel (08:00 peak, 14:00 off-peak, 17:45 peak, let the clock run, add or clear a traffic jam).
- **Authority dashboard** (`/dashboard`): section 2.5.
- A first web version of the conductor page (`/conductor`) still exists. The old plain-HTML pages in `frontend/` are only a fallback
  when the React pages have not been built.

### 2.8 Passengers and crowd levels
- A bus gets passengers at each stop: a random number with an average of `stop weight x (3 + 9 x rush intensity)`
  (weight 3 at both bus stands, 1.3 at every third stop, 1 elsewhere), each with a random destination stop further along.
- People get off at their destination; at the end of the line everyone gets off. A bus holds at most 70.
- **Green** if fewer than 50 people are on board (seats left), **yellow** from 50 to 64 (standing room), **red** from 65 (full).
- A conductor can issue a ticket (adds one person) or set the level by hand; a manual level lasts until the next stop.

### 2.9 Phone app 1: **YanaBus** (passengers, `mobile/src/passenger/`)
1. Finds the phone's location and lists **routes near you** (the road is within 1.5 km), each with the nearest stop, the distance,
   the next bus there and its crowd level. In Dadalla it offers Galle - Hikkaduwa and Galle - Ambalangoda first.
2. **Search** by route name or stop name ("Matara", "Koggala"). If location is off, all routes are listed.
3. Opening a route shows a **live map** (Leaflet in a WebView): the road, the stops, the user's blue dot and the buses. Each bus pin
   shows the number of people on board and is **coloured green / yellow / red**; an arrow shows its direction.
4. Tapping a stop shows the next buses to that stop with their arrival time and crowd level. Tapping a bus card finds it on the map.
5. Shows the delay banner when the route is running late.

### 2.10 Phone app 2: **YanaBus - Drivers** (drivers and conductors, `mobile/src/`)
Flow: **sign in** (staff ID and PIN) -> **choose Driver or Conductor** (the app reads the phone location) -> **choose the route**
(the road you are on is suggested) -> **choose the bus** (the nearest bus is suggested) -> the role screen.
- **Driver:** picks the direction, picks **Real phone GPS** (chosen automatically when the phone is on the road) or **Demo GPS**
  (chosen anywhere else), then **Start trip**. While sharing it shows speed, "sent n s ago", the next stop and what passengers see.
  In Demo GPS a "Free road / Slow traffic / Traffic jam" selector changes the speed (30 / 15 / 7 km/h) so the effect on arrival
  times can be shown. **End trip** stops sharing. The screen stays on during a trip.
- **Conductor:** never starts a trip. Until the driver starts, the screen says **Waiting for the driver**. When the driver
  starts, it switches by itself to **Trip in progress** (direction, people on board, next stop, a meter), the three seat buttons
  and the ticket form. If the driver ends the trip, or the driver's phone stops sending GPS for 20 s, it returns to waiting.
- **Switch role, Change route, Change bus and Sign out** are available from the screens.

### 2.11 Trip rule (driver starts, conductor follows)
The server marks a bus's trip as active when the driver starts it and refuses conductor actions (tickets, seat level) until then
("The driver has not started the trip yet"). A new trip starts empty with people boarding at the first stop.

### 2.12 Sign in and location services
- `POST /api/auth/login` checks the staff ID and PIN against `data/staff.json` (or `data/staff.example.json` if that file is missing).
- `GET /api/locate` tells a phone which route it is on (within 500 m of the road) or closest to, the nearest stop, and the nearest bus.
- `GET /api/routes/nearby` ranks all routes by distance from the phone for the passenger app.

### 2.13 Tools and scripts
`run.py` starts the server and prints the addresses. `ml/generate_history.py` and `ml/train_model.py` make the data and the models.
`tools/build_routes.py` builds route files. `config.py` holds every setting.

---

## 3. Architecture

```
 Passenger phone (YanaBus)       Driver phone            Conductor phone       Authority / laptop
 nearby routes, search,          (YanaBus - Drivers)     (YanaBus - Drivers)   web pages
 live map                        GPS + speed             seat level, tickets   passenger map, dashboard
        |                              |                        |                     |
        +------------------------------+--------- Wi-Fi --------+---------------------+
                                       |
                          FastAPI server (backend/app.py)
              +------------------------+----------------------------+
              |                        |                            |
   one Simulation per route     AI model per route           Analytics (pandas)
   (buses, tickets, crowd)      (Random Forest, ETA)         over the history CSV
              |
     route files (GeoJSON), staff.json, history.csv, models/
```

---

## 4. Specific requirements

Status: **Done** = built and tested in the prototype; **Simulated** = built, using simulated data.

### 4.1 Passenger app (YanaBus)
| ID | Requirement | Status |
|---|---|---|
| FR-P1 | On start, the app shall ask for the phone's location and show the routes whose road is within 1.5 km, closest first | Done |
| FR-P2 | For each nearby route the app shall show the nearest stop, its distance, and the next bus to it with its arrival time and crowd level | Done |
| FR-P3 | The app shall let the user search routes and stops by name, without location | Done |
| FR-P4 | If location is off or unavailable, the app shall say so, offer to try again, and list all routes | Done |
| FR-P5 | The app shall show the chosen route on a map with its stops and its buses, updated every 2 seconds | Done (Simulated buses) |
| FR-P6 | Each bus on the map shall show the number of people on board and be coloured green (seats), yellow (standing room) or red (full) | Done |
| FR-P7 | The user shall be able to pick a stop and see the arrival time and crowd level of the buses heading to it | Done |
| FR-P8 | The app shall list the buses of the route with passengers, seats left or "full", next stop and arrival time | Done |
| FR-P9 | The app shall show a delay banner when the route is running 5 or more minutes slower than usual | Done |
| FR-P10 | The phone's Back button shall return from a route to the home screen | Done |

### 4.2 Drivers app: sign in, role, route, bus
| ID | Requirement | Status |
|---|---|---|
| FR-A1 | Staff shall sign in with a staff ID and PIN checked by the server; a wrong PIN shall be refused | Done |
| FR-A2 | After sign in the user shall choose Driver or Conductor | Done |
| FR-A3 | The app shall read the phone's location and tell the user whether they are on a route | Done |
| FR-A4 | The user shall choose a route; the route they are on shall be suggested first | Done |
| FR-A5 | The user shall choose a bus; the nearest bus (within 1 km) shall be suggested first and each bus shall show whether its trip has started | Done |
| FR-A6 | The user shall be able to switch role, change route, change bus and sign out | Done |
| FR-A7 | The app shall find the server on the laptop by itself and let the user check or change the address | Done |

### 4.3 Driver
| ID | Requirement | Status |
|---|---|---|
| FR-D1 | The driver shall start and end a trip for the chosen bus and direction | Done |
| FR-D2 | While a trip runs, the app shall send position and speed to the server and show whether it is sending | Done |
| FR-D3 | The GPS source shall default to Real GPS when the phone is on the route and Demo GPS otherwise, and the driver can change it | Done |
| FR-D4 | In Demo GPS the app shall move along the route and let the driver choose free road, slow traffic or jam | Done (Simulated) |
| FR-D5 | The app shall warn when the phone is far from the route and cannot be placed on it | Done |
| FR-D6 | The app shall keep the screen on during a trip | Done |

### 4.4 Conductor
| ID | Requirement | Status |
|---|---|---|
| FR-C1 | The conductor shall not be able to start a trip; the server shall refuse conductor actions until the driver has started | Done |
| FR-C2 | Before the trip starts, the screen shall say it is waiting for the driver | Done |
| FR-C3 | When the driver starts or ends the trip, the screen shall update by itself (within about 2 seconds) and say so | Done |
| FR-C4 | During a trip the screen shall show the direction, people on board, crowd level and next stop | Done |
| FR-C5 | The conductor shall be able to set Seats available, Standing room or Full, or go back to automatic | Done |
| FR-C6 | The conductor shall be able to issue a ticket to any stop the bus still visits | Done |

### 4.5 Server and simulation
| ID | Requirement | Status |
|---|---|---|
| FR-S1 | The server shall run several routes at once, each with its own buses, clock effects and AI model | Done |
| FR-S2 | Simulated buses shall move along the road, stop at every stop, turn round at the ends, and take passengers on and off | Simulated |
| FR-S3 | A bus driven by a phone shall stop being simulated; if its phone sends nothing for 20 s the simulation shall take over again and the trip shall end | Done |
| FR-S4 | A position more than 500 m from the road shall not move the bus | Done |
| FR-S5 | The demo controls shall set the time of day for all routes, run or stop the clock, and add or clear a traffic jam on a section | Done |
| FR-S6 | A new trip shall start with an empty bus, with people boarding at the first stop | Done |

### 4.6 AI arrival time
| ID | Requirement | Status |
|---|---|---|
| FR-AI1 | The system shall predict the time of every section of every route from the time of day and the latest speed reports | Done |
| FR-AI2 | The ETA of a bus at a stop shall be the rest of its current section plus the predicted sections up to the stop | Done |
| FR-AI3 | A slow speed reported by a bus phone shall raise the predicted times for that section and the neighbouring sections | Done |
| FR-AI4 | The accuracy shall be measured on days not used for training and compared with a timetable and a history average | Done (see 2.3) |

### 4.7 Authority dashboard (Big Data)
| ID | Requirement | Status |
|---|---|---|
| FR-BD1 | The system shall keep a history of trips by route, section, hour and day | Simulated (generated data) |
| FR-BD2 | The dashboard shall show which routes are late most often, delay by hour, the five slowest sections and the AI accuracy | Done |
| FR-BD3 | The dashboard shall show a speed heatmap of the road, by hour of the day | Done |

---

## 5. External interfaces and data

### 5.1 Server API (JSON over HTTP, port 8000)
| Method and path | Purpose |
|---|---|
| `GET /api/routes` | All live routes with their stop names (the passenger app searches these) |
| `GET /api/routes/nearby?lat&lng` | All routes, closest to the phone first, with nearest stop and next bus |
| `GET /api/route?route=` | One route: road line, stops, section names |
| `GET /api/state?route=` | Live state: time, mode, buses (position, people on board, crowd, next stop, trip status), delay alert |
| `GET /api/stops?route=` | Every stop with the next bus coming to it |
| `GET /api/stops/{id}/eta?route=` | Buses heading to a stop, with arrival time and crowd level |
| `POST /api/auth/login` | Check a staff ID and PIN |
| `GET /api/locate?lat&lng` | Which route the phone is on or closest to, nearest stop, nearest bus |
| `POST /api/driver/start`, `/location`, `/stop` | Start a trip, send a GPS fix (lat, lng, speed), end a trip |
| `POST /api/conductor/ticket`, `/crowd` | Issue a ticket, set the crowd level (refused until the trip has started) |
| `POST /api/demo/hour`, `/clock`, `/incident` | Demo controls |
| `GET /api/analytics/summary`, `/heatmap?hour=` | Dashboard data |

`route` is a route id such as `galle-matara`; when it is left out the first route is used.

### 5.2 Data files
| File | Content |
|---|---|
| `data/route_*.geojson` | A route: one line (the road) and the stops (name, order, distance from the start, position on the line) |
| `data/staff.json` | Demo staff accounts: id, name, pin, roles. Not published; `data/staff.example.json` is used when it is missing |
| `data/history.csv` | Generated past trips: route, date, slot, hour, day of week, section, normal minutes, previous bus's slowdown, actual minutes |
| `models/<route>/` | Trained model, average slowdowns and accuracy figures for each route (made by `ml/train_model.py`) |

### 5.3 Settings (`config.py`)
Routes and bus number plates, rush-hour times, normal trip time, simulation speed, seats (50), maximum load (70), the "full" level (65),
history length, and the extra history-only routes.

---

## 6. Non-functional requirements

| ID | Requirement | How it is met / measured |
|---|---|---|
| NFR-1 Performance | Live data shall reach a phone within about 2 seconds | Phones read the server every 2 s; the simulation ticks every 0.5 s |
| NFR-2 Accuracy | Predicted trip times shall beat a plain timetable | 1.3 to 3.0 min average error against 3.9 to 10.1 min (section 2.3) |
| NFR-3 Usability | Screens shall be usable on a phone with large buttons, plain words and colour plus text for crowd levels | Mobile-first screens; every colour has a label |
| NFR-4 Reliability | Losing a phone's signal shall not break the system | After 20 s without GPS the simulation takes over and the trip ends; apps show Offline and keep trying |
| NFR-5 Privacy | Only the bus position during a trip shall be shared; no passenger personal data shall be stored | Location is sent only while a trip runs; the passenger app sends its location only to ask for nearby routes |
| NFR-6 Security (prototype) | Sign in shall identify staff | PIN checked by the server. Not production-grade: no tokens, plain-text PINs in a file, other endpoints open |
| NFR-7 Low cost | No hardware beyond the staff's own phones | Driver phone GPS replaces trackers |
| NFR-8 Portability | The apps shall run on Android and iPhone | React Native (Expo); tested on the Android emulator |
| NFR-9 Maintainability | One place for settings, one codebase for both apps | `config.py`; `mobile/` builds both apps from shared code |

---

## 7. Emerging technologies used

| Technology | Where |
|---|---|
| **Artificial intelligence** | Random Forest arrival-time model per route, learning from history and live speed reports |
| **Big Data analytics** | 269,280 records analysed with pandas; late-route ranking, delay by hour, slowest sections, speed heatmap |
| **Crowdsourcing / mobile sensing (replaces IoT trackers)** | Position and speed from the driver's phone, crowd level from the conductor's phone |
| **Cloud computing (design)** | The server is one stateless Python service that can run on a cloud host. The prototype runs on a laptop and is not deployed |

---

## 8. Verification (what was tested)

| Test | Result |
|---|---|
| Server API: sign in with a good and a wrong PIN | Good PIN accepted, wrong PIN refused (401) |
| Location look-up (near Boossa, near Dadalla, in Colombo) | On route, on route with Galle - Hikkaduwa and Galle - Ambalangoda first, not on any route |
| Driver GPS replayed along the road | Bus moved to the reported place; a far-away fix was refused as "off route" |
| Jam reported by a driver phone | ETA to Hikkaduwa rose from 22.8 to 40.3 min and the delay banner appeared |
| Conductor actions before and after the driver starts and ends a trip | Refused (409), accepted, refused again |
| Crowd mix | Off-peak: all green (average 13 on board). 08:00 peak: 47% green, 33% yellow, 20% red |
| AI accuracy | Table in section 2.3 |
| Passenger app in the Android emulator | Nearby routes from the emulator's location, search for "Kogg", live map with coloured buses on two routes, stop selection |
| Drivers app in the Android emulator | Sign in, role, route suggestion, bus list with trip status and nearest bus |
| Conductor screen follows the driver | Waiting, then switched to Trip in progress by itself, then back to waiting when the trip ended |
| Real GPS mode | Tested with a simulated phone location in a browser, not with real satellites |
| Real phone over Wi-Fi | **Not tested yet** |

---

## 9. Limitations and future work

- Buses, passengers and past trips are **simulated**. A real system needs real trips to train and test the model.
- The sign-in is a **prototype**: use accounts in a database with hashed passwords and tokens, and protect the API.
- A phone browser or Expo Go app cannot send GPS in the background; a published app can. The Demo GPS stands in for a moving bus.
- Stops of the extra routes come from OpenStreetMap and need a local check of names and positions.
- The map and the route tools need internet (OpenStreetMap, OSRM, Overpass).
- Future work: cloud hosting, a database, background GPS, push notifications ("your bus is 2 minutes away"), Sinhala and Tamil,
  digital ticket payments, and many more routes.

---

## 10. Running it

See `README.md` for the commands. In short: `python run.py` starts the server, `npm run passenger` and `npm run drivers`
(in `mobile/`) start the two phone apps for Expo Go, and `http://<laptop-ip>:8000/?demo` and `/dashboard` are the web pages.
