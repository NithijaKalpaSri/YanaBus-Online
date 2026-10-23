"""Makes the fake 'past trips' dataset (the Big Data part).

In the real system this would be months of trips collected from conductor
phones. Here we generate it with the same rules the simulator uses, plus
slow-moving traffic changes and random incidents so the AI has something to learn.

Run:  python ml/generate_history.py
"""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd

import config
import world
from route import ROUTES
from world import WORLDS


def route_specs():
    """Every live route (from its road data) plus the routes that only appear in the dashboard."""
    specs = []
    for rid, r in ROUTES.items():
        w = WORLDS[rid]
        specs.append({
            "name": r.name,
            "severity": 1.0,                      # already inside w.sensitivity
            "sections": list(zip(r.seg_names, r.seg_len, w.base_min, w.sensitivity)),
        })
    for name, r in config.OTHER_ROUTES.items():
        specs.append({"name": name, "severity": r["severity"], "sections": r["sections"]})
    return specs


def generate_route(spec, rng):
    sections = spec["sections"]
    n = len(sections)
    base = np.array([s[2] for s in sections])
    sens = np.array([s[3] for s in sections]) * spec["severity"]
    rows = []

    for d in range(config.HISTORY_DAYS):
        day = date.fromisoformat(config.HISTORY_START_DATE) + timedelta(days=d)
        weekend = day.weekday() >= 5
        drift = np.zeros(n)        # slow traffic changes (carry over between trips)
        incident = np.zeros(n)     # a sudden jam that fades away
        prev_ratio = np.ones(n)    # last bus's time / normal time on each section

        for slot in range(config.TRIPS_PER_DAY):
            hour = config.FIRST_TRIP_HOUR + slot * config.TRIP_GAP_MIN / 60
            drift = 0.85 * drift + rng.normal(0, 0.07, n)
            incident = incident * 0.8
            incident[rng.random(n) < 0.004] += 0.7

            rush = 1 + sens * world.peak_intensity(hour, weekend)
            ratio = rush * np.exp(drift + incident) * rng.lognormal(0, 0.05, n)
            actual = base * ratio

            for s in range(n):
                rows.append((spec["name"], day.isoformat(), slot, round(hour, 4),
                             day.weekday(), int(weekend), s, sections[s][0],
                             round(sections[s][1], 3), round(base[s], 3),
                             round(prev_ratio[s], 4), round(actual[s], 3)))
            prev_ratio = ratio

    return rows


def main():
    rng = np.random.default_rng(config.RANDOM_SEED)
    rows = []
    for spec in route_specs():
        rows += generate_route(spec, rng)

    df = pd.DataFrame(rows, columns=[
        "route", "date", "slot", "hour", "dow", "weekend", "seg", "seg_name",
        "seg_km", "base_min", "prev_ratio", "actual_min"])
    config.DATA_DIR.mkdir(exist_ok=True)
    df.to_csv(config.HISTORY_FILE, index=False)
    trips = df.groupby(["route", "date", "slot"]).ngroups
    print(f"Saved {len(df):,} section records ({trips:,} trips) to {config.HISTORY_FILE}")
    print(df.groupby("route").size().to_string())


if __name__ == "__main__":
    main()
