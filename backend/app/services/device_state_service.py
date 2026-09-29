"""Simulated device state, held in memory.

Temporary: it stands in for real ESP32 feedback until hardware integration.
State resets to the defaults whenever the server restarts.
"""

import threading

from app.constants import COMMAND_DEFINITIONS, DEVICES


class DeviceStateService:
    def __init__(self):
        self._lock = threading.Lock()
        self._states = {
            device: config["default_state"] for device, config in DEVICES.items()
        }

    def get_all(self):
        """Return a copy shaped like the API response: {device: {"state": ...}}."""
        with self._lock:
            return {device: {"state": state} for device, state in self._states.items()}

    def apply_command(self, command):
        """Set the device state a (validated) command produces."""
        definition = COMMAND_DEFINITIONS.get(command)
        if definition is None:
            raise ValueError("Unknown command.")
        with self._lock:
            self._states[definition["device"]] = definition["result_state"]