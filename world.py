"""The 'real world' rules: how long a bus takes on each road section.

The history generator and the live simulator both use these rules, so the AI
model learns the same patterns the simulated buses follow.
"""
import math

import config
from route import ROUTES, route as default_route

# Free-road speed (the same for every route), from the first route's off-peak trip time
FREE_SPEED_KMH = default_route.length / (config.OFFPEAK_TRIP_MIN / 60)


def peak_intensity(hour, weekend=False):
    """0 = free road, 1 = height of the rush hour."""
    morning = math.exp(-((hour - config.MORNING_PEAK_HOUR) / 1.1) ** 2)
    evening = math.exp(-((hour - config.EVENING_PEAK_HOUR) / 1.3) ** 2)
    value = max(morning, evening)
    return value * (config.WEEKEND_PEAK_FACTOR if weekend else 1.0)


def mode_name(hour, weekend=False):
    p = peak_intensity(hour, weekend)
    if p > 0.6:
        return "Peak hour"
    if p > 0.2:
        return "Busy"
    return "Off-peak"


def default_sensitivity(n):
    """Rush-hour sensitivity for a route with `n` sections: worst near Galle, a bit worse at the far end."""
    if n <= 5:
        return [0.9, 0.7, 0.5, 0.4, 0.6][:n]
    return [0.9, 0.8, 0.7] + [0.35] * (n - 5) + [0.5, 0.6]


class World:
    """The rules for one route."""

    def __init__(self, route):
        self.route = route
        self.n_seg = len(route.seg_len)
        self.base_min = [km / FREE_SPEED_KMH * 60 for km in route.seg_len]    # minutes per section, free road
        raw = (config.SECTION_SENSITIVITY if route.id == config.DEFAULT_ROUTE_ID and len(config.SECTION_SENSITIVITY) == self.n_seg
               else default_sensitivity(self.n_seg))
        # scale so the whole trip is 1.5x slower at the height of the rush (times the route's severity)
        weighted = sum(s * m for s, m in zip(raw, self.base_min)) / sum(self.base_min)
        self.sensitivity = [s * 0.5 / weighted * route.severity for s in raw]

    def congestion(self, seg, hour, weekend=False):
        """How many times slower than free-flow section `seg` is at this hour."""
        return 1 + self.sensitivity[seg] * peak_intensity(hour, weekend)


WORLDS = {rid: World(r) for rid, r in ROUTES.items()}
