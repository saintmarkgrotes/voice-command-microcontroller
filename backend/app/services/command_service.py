"""Turns a validated command into an encrypted payload.

Plaintext layout (UTF-8 JSON, compact, keys sorted):
    {"command":"LIGHT_ON","command_id":"<uuid>","device":"light","timestamp":1750000000}

The timestamp and command_id are always generated here on the server.
"""

import json
import time
import uuid

# Additional authenticated data. Not transmitted; the receiver must supply the
# exact same bytes to decrypt. Bump the suffix if the plaintext format changes.
COMMAND_AAD = b"smart-home-command-v1"


class CommandService:
    def __init__(
        self, encryption_service, device_state_service, clock=time.time, id_factory=None
    ):
        self._encryption = encryption_service
        self._device_state = device_state_service
        self._clock = clock
        self._new_id = id_factory or (lambda: str(uuid.uuid4()))

    def build_command(self, device, command):
        """Create the internal command object. Inputs must already be validated."""
        return {
            "command_id": self._new_id(),
            "device": device,
            "command": command,
            "timestamp": int(self._clock()),
        }

    def process(self, device, command):
        internal = self.build_command(device, command)
        plaintext = json.dumps(internal, separators=(",", ":"), sort_keys=True)
        encrypted_payload = self._encryption.encrypt(
            plaintext, associated_data=COMMAND_AAD
        )

        # Only after encryption succeeded: a failed command must not change state.
        self._device_state.apply_command(command)

        return {
            "command_id": internal["command_id"],
            "device": internal["device"],
            "encrypted_payload": encrypted_payload,
        }