"""Small in-memory sliding-window rate limiter.

Good enough for a single-process server. State is lost on restart and is not
shared between processes; use Redis (for example via Flask-Limiter) if the
backend is ever run with several workers.
"""

import math
import threading
import time
from collections import deque

from app.errors import RateLimitedError

MAX_TRACKED_KEYS = 10_000


class RateLimiter:
    def __init__(self, max_events, window_seconds, clock=time.monotonic):
        if max_events < 1 or window_seconds < 1:
            raise ValueError("max_events and window_seconds must be at least 1.")
        self._max = max_events
        self._window = window_seconds
        self._clock = clock
        self._events = {}
        self._lock = threading.Lock()

    def _recent(self, key, now):
        events = self._events.get(key)
        if events is None:
            return None
        while events and events[0] <= now - self._window:
            events.popleft()
        if not events:
            del self._events[key]
            return None
        return events

    def retry_after(self, key):
        """Seconds until `key` may act again (0 if it may act now). Records nothing."""
        with self._lock:
            now = self._clock()
            events = self._recent(key, now)
            if events is None or len(events) < self._max:
                return 0
            return max(1, math.ceil(events[0] + self._window - now))

    def hit(self, key):
        """Record one event for `key`."""
        with self._lock:
            now = self._clock()
            self._recent(key, now)
            self._events.setdefault(key, deque()).append(now)
            while len(self._events) > MAX_TRACKED_KEYS:
                self._events.pop(next(iter(self._events)))  # drop the oldest key

    def check_and_hit(self, key):
        """Allow and record the event, or return the seconds to wait (nothing recorded)."""
        wait = self.retry_after(key)
        if wait == 0:
            self.hit(key)
        return wait

    def reset(self, key):
        with self._lock:
            self._events.pop(key, None)


def enforce_rate_limit(limiter, key):
    """Raise RateLimitedError (429 + Retry-After) if `key` is over its limit."""
    wait = limiter.check_and_hit(key)
    if wait:
        raise RateLimitedError(
            "Too many requests. Please wait a moment.",
            headers={"Retry-After": str(wait)},
        )