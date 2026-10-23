"""Trains the AI model that predicts travel time on each road section (one model per live route).

The model predicts "how many times slower than normal" a section is, from:
  section, hour, day of week, weekend, and prev_ratio
where prev_ratio is how slow the previous bus was on that section. In the live
system this comes from other buses' phones (the crowdsourced part).

It is compared with two simple methods:
  - timetable: always the normal (free-road) time
  - hist_avg : the average for that section at that hour (no live information)

Run:  python ml/train_model.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

import config
from route import ROUTES

FEATURES = ["seg", "hour", "dow", "weekend", "prev_ratio"]
TEST_DAYS = 10     # the last 10 days are never shown to the model while training


def train_route(all_rows, route):
    df = all_rows[all_rows["route"] == route.name].copy()
    df["ratio"] = df["actual_min"] / df["base_min"]
    df["hour_int"] = df["hour"].astype(int)

    dates = sorted(df["date"].unique())
    test_dates = set(dates[-TEST_DAYS:])
    train = df[~df["date"].isin(test_dates)]
    test = df[df["date"].isin(test_dates)].copy()

    # --- AI model ---
    model = RandomForestRegressor(n_estimators=120, max_depth=14,
                                  min_samples_leaf=5, n_jobs=-1,
                                  random_state=config.RANDOM_SEED)
    model.fit(train[FEATURES].values, train["ratio"].values)
    test["pred_rf"] = model.predict(test[FEATURES].values) * test["base_min"]

    # --- simple baselines ---
    table = train.groupby(["weekend", "seg", "hour_int"])["ratio"].mean()
    test["pred_hist"] = [table.get((w, s, h), 1.0)
                         for w, s, h in zip(test["weekend"], test["seg"], test["hour_int"])]
    test["pred_hist"] = test["pred_hist"] * test["base_min"]
    test["pred_timetable"] = test["base_min"]

    def mae(col):
        return float(np.abs(test[col] - test["actual_min"]).mean())

    # error of a whole trip = sum of its section predictions vs the real trip time
    trips = test.groupby(["date", "slot"])[["actual_min", "pred_rf", "pred_hist",
                                            "pred_timetable"]].sum()

    def trip_mae(col):
        return float(np.abs(trips[col] - trips["actual_min"]).mean())

    metrics = {
        "route": route.name,
        "train_records": int(len(train)),
        "test_records": int(len(test)),
        "test_trips": int(len(trips)),
        "section_mae_min": {"ai_model": mae("pred_rf"), "hist_avg": mae("pred_hist"),
                            "timetable": mae("pred_timetable")},
        "trip_mae_min": {"ai_model": trip_mae("pred_rf"), "hist_avg": trip_mae("pred_hist"),
                         "timetable": trip_mae("pred_timetable")},
    }

    # --- save ---
    folder = config.model_dir(route.id)
    folder.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, folder / "eta_model.joblib")

    # average slowdown for every (weekend, section, hour): used when no live data exists
    full = df.groupby(["weekend", "seg", "hour_int"])["ratio"].mean()
    baseline = {f"{w}|{s}|{h}": float(v) for (w, s, h), v in full.items()}
    with open(folder / "baseline.json", "w") as f:
        json.dump(baseline, f)
    with open(folder / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)
    return metrics


def main():
    rows = pd.read_csv(config.HISTORY_FILE)
    for route in ROUTES.values():
        m = train_route(rows, route)
        t = m["trip_mae_min"]
        print(f"{route.name:22} trip error: AI {t['ai_model']:.1f} min | history average {t['hist_avg']:.1f} min "
              f"| timetable {t['timetable']:.1f} min")


if __name__ == "__main__":
    main()
