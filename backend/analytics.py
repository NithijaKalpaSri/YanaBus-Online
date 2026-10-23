"""Big Data analysis of the past trips, for the transport authority dashboard."""
import json

import pandas as pd

import config
from route import route

LATE_LIMIT = 0.30      # a trip counts as "late" if it is 30% slower than normal


class Analytics:
    def __init__(self):
        if not config.HISTORY_FILE.exists():
            raise SystemExit("History data not found. Run: python ml/generate_history.py")
        self.df = pd.read_csv(config.HISTORY_FILE)
        self.df["delay_min"] = self.df["actual_min"] - self.df["base_min"]
        self.df["hour_int"] = self.df["hour"].astype(int)
        self.df["speed_kmh"] = self.df["seg_km"] / self.df["actual_min"] * 60

        # one row per trip (all sections of one bus trip added up)
        trips = self.df.groupby(["route", "date", "slot", "hour_int", "weekend"]).agg(
            actual=("actual_min", "sum"), base=("base_min", "sum")).reset_index()
        trips["delay_pct"] = (trips["actual"] / trips["base"] - 1) * 100
        trips["late"] = trips["delay_pct"] > LATE_LIMIT * 100
        self.trips = trips

        try:
            with open(config.model_dir(config.DEFAULT_ROUTE_ID) / "metrics.json") as f:
                self.metrics = json.load(f)
        except FileNotFoundError:
            self.metrics = None

    def summary(self):
        wd = self.trips[self.trips["weekend"] == 0]
        by_route = wd.groupby("route").agg(
            avg_delay_pct=("delay_pct", "mean"),
            late_trips_pct=("late", "mean"),
            avg_delay_min=("actual", "mean"),
            base_min=("base", "mean")).reset_index()
        by_route["avg_delay_min"] = by_route["avg_delay_min"] - by_route["base_min"]
        by_route["late_trips_pct"] *= 100
        by_route = by_route.sort_values("late_trips_pct", ascending=False)

        by_hour = (wd.groupby(["route", "hour_int"])["delay_pct"].mean()
                   .unstack(0).round(1))
        sections = (self.df[self.df["weekend"] == 0]
                    .groupby(["route", "seg_name"])["delay_min"].mean()
                    .reset_index().sort_values("delay_min", ascending=False).head(5))

        return {
            "trips": int(len(self.trips)),
            "records": int(len(self.df)),
            "days": config.HISTORY_DAYS,
            "late_limit_pct": int(LATE_LIMIT * 100),
            "routes": by_route.round(1).to_dict("records"),
            "hours": {"labels": [int(h) for h in by_hour.index],
                      "series": {r: [None if pd.isna(v) else float(v) for v in by_hour[r]]
                                 for r in by_hour.columns}},
            "worst_sections": [{"route": r.route, "section": r.seg_name,
                                "avg_delay_min": round(r.delay_min, 1)}
                               for r in sections.itertuples()],
            "model": self.metrics,
        }

    def heatmap(self, hour):
        """Average speed on every section of the live route at the chosen hour."""
        d = self.df[(self.df["route"] == config.ROUTE_NAME)
                    & (self.df["weekend"] == 0) & (self.df["hour_int"] == hour)]
        speeds = d.groupby("seg")["speed_kmh"].mean()
        return [{"section": route.seg_names[s],
                 "speed_kmh": round(float(speeds.get(s, 0)), 1),
                 "path": route.section_path(s)} for s in range(len(route.seg_len))]
