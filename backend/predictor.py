"""Uses the trained AI model of a route to predict travel time on every road section."""
import json

import joblib
import numpy as np

import config


class Predictor:
    def __init__(self, world):
        self.world = world
        folder = config.model_dir(world.route.id)
        if not (folder / "eta_model.joblib").exists():
            raise SystemExit("AI model not found. Run these first:\n"
                             "  python ml/generate_history.py\n"
                             "  python ml/train_model.py")
        self.model = joblib.load(folder / "eta_model.joblib")
        self.model.n_jobs = 1                       # quicker for tiny predictions
        with open(folder / "baseline.json") as f:
            self.baseline = json.load(f)

    def usual_ratio(self, seg, hour, weekend=False):
        """Average slowdown for this section at this hour (used when no bus has reported)."""
        return self.baseline.get(f"{int(weekend)}|{seg}|{int(hour)}", 1.0)

    def section_minutes(self, hour, dow, live_ratio):
        """Predicted minutes for every section.

        live_ratio[s] = how slow the latest bus on section s was compared with
        normal (reported by its phone), or None if no recent report.
        """
        weekend = int(dow >= 5)
        rows = []
        for s in range(self.world.n_seg):
            ratio = live_ratio[s]
            if ratio is None:
                ratio = self.usual_ratio(s, hour, weekend)
            rows.append([s, hour, dow, weekend, ratio])
        pred = self.model.predict(np.array(rows))
        return [float(r * b) for r, b in zip(pred, self.world.base_min)]

    def usual_minutes(self, hour, weekend=False):
        """What a trip normally takes at this hour (no live information)."""
        return [self.usual_ratio(s, hour, weekend) * b
                for s, b in enumerate(self.world.base_min)]
