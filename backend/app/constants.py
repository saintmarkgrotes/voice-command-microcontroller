"""Shared vocabulary. Mirrors the frontend's src/constants/deviceConfig.js.

If a device or command is added, update BOTH this file and the frontend
(and docs/api.md).
"""

from types import MappingProxyType

DEVICES = MappingProxyType(
    {
        "light": {"default_state": "off"},
        "fan": {"default_state": "off"},
        "door": {"default_state": "closed"},
        "pump": {"default_state": "off"},
    }
)

COMMAND_DEFINITIONS = MappingProxyType(
    {
        "LIGHT_ON": {"device": "light", "result_state": "on"},
        "LIGHT_OFF": {"device": "light", "result_state": "off"},
        "FAN_ON": {"device": "fan", "result_state": "on"},
        "FAN_OFF": {"device": "fan", "result_state": "off"},
        "DOOR_OPEN": {"device": "door", "result_state": "open"},
        "DOOR_CLOSE": {"device": "door", "result_state": "closed"},
        "PUMP_ON": {"device": "pump", "result_state": "on"},
        "PUMP_OFF": {"device": "pump", "result_state": "off"},
    }
)