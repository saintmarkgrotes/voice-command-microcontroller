"""Keeps three things in agreement: the written ESP32 spec (docs/esp32.md), the test vectors
(docs/esp32-test-vectors.json) and the real backend.

`receive()` below is a REFERENCE MODEL of what the ESP32 must do, written in Python only so the
rules can be tested. It is not firmware. Its steps are the numbered steps in docs/esp32.md.
"""

import base64
import binascii
import json
import time
from collections import deque
from pathlib import Path

import pytest
from Crypto.Cipher import AES

from app.services.command_service import COMMAND_AAD
from app.services.encryption_service import DecryptionError, EncryptionService
from scripts.make_test_vectors import AAD, TEST_KEY, generate

VECTORS_PATH = Path(__file__).resolve().parents[2] / "docs" / "esp32-test-vectors.json"
VECTORS = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))

RULES = VECTORS["rules"]
KNOWN_COMMANDS = {
    "LIGHT_ON": "light",
    "LIGHT_OFF": "light",
    "FAN_ON": "fan",
    "FAN_OFF": "fan",
    "DOOR_OPEN": "door",
    "DOOR_CLOSE": "door",
    "PUMP_ON": "pump",
    "PUMP_OFF": "pump",
}
ENVELOPE_FIELDS = {"algorithm", "nonce", "ciphertext", "tag"}
PLAINTEXT_FIELDS = {"command", "command_id", "device", "timestamp"}
MAX_CIPHERTEXT_BYTES = 256
MAX_COMMAND_ID_LENGTH = 64


class Reject(Exception):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


def _b64(value):
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise Reject("bad_encoding") from None


def receive(envelope, key, now, recent_ids):
    """The ESP32 pipeline. Returns the command dict, or raises Reject(reason).

    `now` is the device's trusted Unix time, or None if its clock is not synchronized.
    `recent_ids` is a deque(maxlen=32) that persists between messages.
    """
    # 1. Envelope: exactly four string fields and the right algorithm name.
    if not isinstance(envelope, dict) or set(envelope) != ENVELOPE_FIELDS:
        raise Reject("bad_envelope")
    if not all(isinstance(envelope[name], str) for name in ENVELOPE_FIELDS):
        raise Reject("bad_envelope")
    if envelope["algorithm"] != "AES-256-GCM":
        raise Reject("bad_envelope")

    # 2. Decode and check sizes BEFORE doing any cryptography.
    nonce, ciphertext, tag = (_b64(envelope[n]) for n in ("nonce", "ciphertext", "tag"))
    if len(nonce) != 12 or len(tag) != 16:
        raise Reject("bad_length")
    if not 1 <= len(ciphertext) <= MAX_CIPHERTEXT_BYTES:
        raise Reject("bad_length")

    # 3. Authenticated decryption. Nothing is released unless the tag verifies.
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce, mac_len=16)
    cipher.update(AAD)
    try:
        plaintext = cipher.decrypt_and_verify(ciphertext, tag)
    except ValueError:
        raise Reject("auth_failed") from None

    # 4. Plaintext: JSON object with exactly four fields of the right types.
    try:
        body = json.loads(plaintext)
    except ValueError:
        raise Reject("bad_plaintext") from None
    if not isinstance(body, dict) or set(body) != PLAINTEXT_FIELDS:
        raise Reject("bad_plaintext")
    command, command_id, device, timestamp = (
        body["command"], body["command_id"], body["device"], body["timestamp"],
    )
    if not (isinstance(command, str) and isinstance(device, str) and isinstance(command_id, str)):
        raise Reject("bad_plaintext")
    if not isinstance(timestamp, int) or isinstance(timestamp, bool):
        raise Reject("bad_plaintext")
    if not 1 <= len(command_id) <= MAX_COMMAND_ID_LENGTH:
        raise Reject("bad_plaintext")

    # 5. Allow-list: a known command that belongs to the named device (exact case).
    if command not in KNOWN_COMMANDS:
        raise Reject("unknown_command")
    if KNOWN_COMMANDS[command] != device:
        raise Reject("device_mismatch")

    # 6. Freshness (needs a trusted clock; without one, refuse everything).
    if now is None:
        raise Reject("no_trusted_time")
    if timestamp - now > RULES["max_future_skew_seconds"]:
        raise Reject("future")
    max_age = (
        RULES["door_open_max_age_seconds"]
        if command == "DOOR_OPEN"
        else RULES["default_max_age_seconds"]
    )
    if now - timestamp > max_age:
        raise Reject("stale")

    # 7. Duplicate: remember the id only now that everything else has passed.
    if command_id in recent_ids:
        raise Reject("duplicate")
    recent_ids.append(command_id)

    return body  # 8. the device may now act on it


def run(envelope, now):
    ids = deque(maxlen=RULES["recent_ids_remembered"])
    try:
        return "accept", receive(envelope, TEST_KEY, now, ids)
    except Reject as rejected:
        return "reject", rejected.reason


# --- The committed vectors file is exactly what the generator produces -----------

def test_vectors_file_is_up_to_date():
    assert VECTORS == generate(), (
        "docs/esp32-test-vectors.json is out of date. Run: python -m scripts.make_test_vectors"
    )


def test_vectors_use_the_documented_constants():
    assert VECTORS["aad"] == COMMAND_AAD.decode()
    assert VECTORS["test_key_hex"] == TEST_KEY.hex()
    assert len(VECTORS["vectors"]) >= 40


# --- Every vector gives the expected result in the reference receiver -----------

@pytest.mark.parametrize("vector", VECTORS["vectors"], ids=lambda v: v["name"])
def test_single_message_vectors(vector):
    outcome, detail = run(vector["envelope"], vector["now"])
    expected = vector["expect"]
    assert outcome == expected["result"]
    if outcome == "reject":
        assert detail == expected["reason"]
    else:
        assert json.dumps(detail, separators=(",", ":"), sort_keys=True) == vector["plaintext"]


@pytest.mark.parametrize("sequence", VECTORS["sequences"], ids=lambda s: s["name"])
def test_sequence_vectors(sequence):
    ids = deque(maxlen=RULES["recent_ids_remembered"])  # shared across the whole sequence
    for item in sequence["messages"]:
        try:
            receive(item["envelope"], TEST_KEY, sequence["now"], ids)
            outcome, reason = "accept", None
        except Reject as rejected:
            outcome, reason = "reject", rejected.reason
        assert outcome == item["expect"]["result"], item["name"]
        if outcome == "reject":
            assert reason == item["expect"]["reason"], item["name"]


def test_the_vectors_cover_every_rejection_reason():
    reasons = {v["expect"].get("reason") for v in VECTORS["vectors"]}
    reasons |= {m["expect"].get("reason") for s in VECTORS["sequences"] for m in s["messages"]}
    reasons.discard(None)
    assert reasons == {
        "bad_envelope", "bad_encoding", "bad_length", "auth_failed", "bad_plaintext",
        "unknown_command", "device_mismatch", "no_trusted_time", "future", "stale", "duplicate",
    }


def test_the_vectors_cover_all_eight_commands():
    accepted = {
        json.loads(v["plaintext"])["command"]
        for v in VECTORS["vectors"]
        if v["expect"]["result"] == "accept" and "plaintext" in v
    }
    assert accepted == set(KNOWN_COMMANDS)


# --- The real backend agrees with the vectors and with the reference receiver ----

def test_backend_service_decrypts_the_good_vectors_and_refuses_the_bad_ones():
    service = EncryptionService.from_hex_key(VECTORS["test_key_hex"])
    for vector in VECTORS["vectors"]:
        if vector["expect"].get("reason") == "auth_failed":
            with pytest.raises(DecryptionError):
                service.decrypt(vector["envelope"], associated_data=COMMAND_AAD)
        elif vector["expect"]["result"] == "accept":
            plaintext = service.decrypt(vector["envelope"], associated_data=COMMAND_AAD)
            assert plaintext.decode() == vector["plaintext"]


@pytest.mark.parametrize(
    "device,command",
    [
        ("light", "LIGHT_ON"), ("light", "LIGHT_OFF"), ("fan", "FAN_ON"), ("fan", "FAN_OFF"),
        ("door", "DOOR_OPEN"), ("door", "DOOR_CLOSE"), ("pump", "PUMP_ON"), ("pump", "PUMP_OFF"),
    ],
)
def test_live_backend_output_passes_the_reference_receiver(client, app, device, command):
    response = client.post("/api/commands", json={"device": device, "command": command})
    assert response.status_code == 200
    body = response.get_json()

    key = bytes.fromhex(app.config["AES_SECRET_KEY"])
    accepted = receive(body["encrypted_payload"], key, int(time.time()), deque(maxlen=32))

    assert (accepted["device"], accepted["command"]) == (device, command)
    assert accepted["command_id"] == body["command_id"]


def test_live_backend_replays_are_caught_by_the_receiver(client, app):
    key = bytes.fromhex(app.config["AES_SECRET_KEY"])
    payload = client.post(
        "/api/commands", json={"device": "door", "command": "DOOR_OPEN"}
    ).get_json()["encrypted_payload"]

    ids = deque(maxlen=32)
    now = int(time.time())
    receive(payload, key, now, ids)
    with pytest.raises(Reject) as replayed:
        receive(payload, key, now, ids)  # an attacker re-sends the captured message
    assert replayed.value.reason == "duplicate"

    with pytest.raises(Reject) as late:
        receive(payload, key, now + 60, deque(maxlen=32))  # replay after a reboot, much later
    assert late.value.reason == "stale"