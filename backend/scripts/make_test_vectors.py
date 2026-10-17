"""Generate docs/esp32-test-vectors.json: known messages for testing an ESP32 receiver.

Usage (from backend/):  python -m scripts.make_test_vectors

The vectors use a FIXED, PUBLIC test key (bytes 00 01 02 ... 1f) and fixed nonces, so the file
is identical on every run. They are built with a plain AES-GCM library and the documented
format only. They are test data: never use this key for anything real.
"""

import base64
import json
from pathlib import Path

from Crypto.Cipher import AES

TEST_KEY = bytes(range(32))
OTHER_KEY = bytes(range(1, 33))
AAD = b"smart-home-command-v1"
NOW = 1750000100  # the receiver's clock in most vectors

COMMANDS = [
    ("light", "LIGHT_ON"),
    ("light", "LIGHT_OFF"),
    ("fan", "FAN_ON"),
    ("fan", "FAN_OFF"),
    ("door", "DOOR_OPEN"),
    ("door", "DOOR_CLOSE"),
    ("pump", "PUMP_ON"),
    ("pump", "PUMP_OFF"),
]

OUTPUT_PATH = Path(__file__).resolve().parents[2] / "docs" / "esp32-test-vectors.json"


def b64(data):
    return base64.b64encode(data).decode("ascii")


def encrypt(plaintext, nonce, key=TEST_KEY, aad=AAD):
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce, mac_len=16)
    cipher.update(aad)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext)
    return {
        "algorithm": "AES-256-GCM",
        "nonce": b64(nonce),
        "ciphertext": b64(ciphertext),
        "tag": b64(tag),
    }


def flip_first_bit(value_b64):
    raw = bytearray(base64.b64decode(value_b64))
    raw[0] ^= 0x01
    return b64(bytes(raw))


def generate():
    counter = {"n": 0}

    def next_nonce():
        counter["n"] += 1
        return counter["n"].to_bytes(12, "big")

    def command_id(n=None):
        return f"00000000-0000-4000-8000-{(n or counter['n'] + 1):012d}"

    def plain(command, device, timestamp, cid=None, **overrides):
        body = {
            "command": command,
            "command_id": cid if cid is not None else command_id(),
            "device": device,
            "timestamp": timestamp,
        }
        body.update(overrides)
        body = {k: v for k, v in body.items() if v is not None}
        return json.dumps(body, separators=(",", ":"), sort_keys=True).encode()

    def message(name, expect, plaintext_bytes, now=NOW, key=TEST_KEY, aad=AAD, note=None):
        envelope = encrypt(plaintext_bytes, next_nonce(), key=key, aad=aad)
        entry = {"name": name, "now": now, "envelope": envelope, "expect": expect}
        if plaintext_bytes is not None and plaintext_bytes[:1] == b"{":
            entry["plaintext"] = plaintext_bytes.decode()
        if note:
            entry["note"] = note
        return entry

    accept = {"result": "accept"}

    def reject(reason):
        return {"result": "reject", "reason": reason}

    vectors = []

    # --- every command, accepted --------------------------------------------------
    for age, (device, command) in enumerate(COMMANDS):
        vectors.append(
            message(f"accept_{command.lower()}", accept, plain(command, device, NOW - age))
        )

    # --- freshness: age > window is stale; DOOR_OPEN has the stricter window -------
    vectors += [
        message("accept_light_on_age_30_boundary", accept, plain("LIGHT_ON", "light", NOW - 30)),
        message("reject_light_on_age_31", reject("stale"), plain("LIGHT_ON", "light", NOW - 31)),
        message("accept_door_open_age_10_boundary", accept, plain("DOOR_OPEN", "door", NOW - 10)),
        message("reject_door_open_age_11", reject("stale"), plain("DOOR_OPEN", "door", NOW - 11)),
        message("accept_door_close_age_25", accept, plain("DOOR_CLOSE", "door", NOW - 25),
                note="Only DOOR_OPEN uses the strict window"),
        message("accept_future_skew_5", accept, plain("LIGHT_ON", "light", NOW + 5)),
        message("reject_future_6", reject("future"), plain("LIGHT_ON", "light", NOW + 6)),
        message("reject_no_trusted_time", reject("no_trusted_time"),
                plain("LIGHT_ON", "light", NOW), now=None,
                note="The device clock has not been synchronized: refuse everything"),
    ]

    # --- cryptographic failures: nothing may be released or executed ---------------
    base = plain("LIGHT_ON", "light", NOW)
    good = message("_base", accept, base)["envelope"]

    def bad_envelope(name, reason, envelope, note=None):
        entry = {"name": name, "now": NOW, "envelope": envelope, "expect": reject(reason)}
        if note:
            entry["note"] = note
        vectors.append(entry)

    bad_envelope("reject_tampered_ciphertext", "auth_failed",
                 {**good, "ciphertext": flip_first_bit(good["ciphertext"])})
    bad_envelope("reject_tampered_tag", "auth_failed", {**good, "tag": flip_first_bit(good["tag"])})
    bad_envelope("reject_tampered_nonce", "auth_failed", {**good, "nonce": flip_first_bit(good["nonce"])})
    bad_envelope("reject_truncated_ciphertext", "auth_failed",
                 {**good, "ciphertext": b64(base64.b64decode(good["ciphertext"])[:-1])})
    vectors.append(message("reject_wrong_aad", reject("auth_failed"), base, aad=b"another-protocol"))
    vectors.append(message("reject_wrong_key", reject("auth_failed"), base, key=OTHER_KEY))

    bad_envelope("reject_wrong_algorithm", "bad_envelope", {**good, "algorithm": "AES-128-GCM"})
    bad_envelope("reject_missing_tag", "bad_envelope",
                 {k: v for k, v in good.items() if k != "tag"})
    bad_envelope("reject_extra_field", "bad_envelope", {**good, "extra": "x"},
                 note="The envelope has exactly four fields")
    bad_envelope("reject_nonce_not_a_string", "bad_envelope", {**good, "nonce": 12345})
    bad_envelope("reject_invalid_base64_nonce", "bad_encoding", {**good, "nonce": "!!!not-base64!!!"})
    bad_envelope("reject_short_nonce", "bad_length", {**good, "nonce": b64(bytes(8))})
    bad_envelope("reject_short_tag", "bad_length",
                 {**good, "tag": b64(base64.b64decode(good["tag"])[:8])})
    bad_envelope("reject_empty_ciphertext", "bad_length", {**good, "ciphertext": ""})
    vectors.append(message("reject_oversized_ciphertext", reject("bad_length"), b"x" * 300,
                           note="Ciphertext above 256 bytes is refused before decrypting"))

    # --- valid encryption, but the plaintext is not an acceptable command ----------
    vectors += [
        message("reject_plaintext_not_json", reject("bad_plaintext"), b"LIGHT_ON"),
        message("reject_plaintext_is_array", reject("bad_plaintext"), b"[1,2,3]"),
        message("reject_missing_timestamp", reject("bad_plaintext"),
                plain("LIGHT_ON", "light", None)),
        message("reject_extra_plaintext_key", reject("bad_plaintext"),
                plain("LIGHT_ON", "light", NOW, extra="x")),
        message("reject_timestamp_is_text", reject("bad_plaintext"),
                plain("LIGHT_ON", "light", str(NOW))),
        message("reject_timestamp_is_fraction", reject("bad_plaintext"),
                plain("LIGHT_ON", "light", NOW + 0.5)),
        message("reject_empty_command_id", reject("bad_plaintext"),
                plain("LIGHT_ON", "light", NOW, cid="")),
        message("reject_command_id_too_long", reject("bad_plaintext"),
                plain("LIGHT_ON", "light", NOW, cid="x" * 65)),
        message("reject_unknown_command", reject("unknown_command"), plain("LIGHT_DIM", "light", NOW)),
        message("reject_lowercase_command", reject("unknown_command"),
                plain("light_on", "light", NOW), note="The device does not normalize case"),
        message("reject_device_mismatch", reject("device_mismatch"), plain("FAN_ON", "light", NOW)),
        message("reject_unknown_device", reject("device_mismatch"), plain("LIGHT_ON", "toaster", NOW)),
    ]

    # --- sequences: the receiver remembers command ids between messages -------------
    def sequence(name, items, note=None):
        entry = {"name": name, "now": NOW, "messages": items}
        if note:
            entry["note"] = note
        return entry

    same_id = command_id(900)
    first = message("first", accept, plain("DOOR_OPEN", "door", NOW, cid=same_id))
    replay = message("replay", reject("duplicate"), plain("DOOR_OPEN", "door", NOW, cid=same_id))
    two_a = message("a", accept, plain("LIGHT_ON", "light", NOW, cid=command_id(901)))
    two_b = message("b", accept, plain("LIGHT_ON", "light", NOW, cid=command_id(902)))
    rejected_first = message("rejected", reject("bad_plaintext"), plain("LIGHT_ON", "light", None, cid=command_id(903)))
    then_ok = message("ok_afterwards", accept, plain("LIGHT_ON", "light", NOW, cid=command_id(903)))

    sequences = [
        sequence("replayed_command_id_is_refused", [first, replay],
                 note="Same command_id, new nonce: the second copy must not run"),
        sequence("same_command_with_new_ids_runs_twice", [two_a, two_b]),
        sequence("a_rejected_message_does_not_use_up_its_id", [rejected_first, then_ok],
                 note="An id is remembered only when the message was accepted"),
    ]

    return {
        "description": "Test vectors for an ESP32 receiver of backend commands. See docs/esp32.md.",
        "test_key_hex": TEST_KEY.hex(),
        "aad": AAD.decode(),
        "now": NOW,
        "rules": {
            "default_max_age_seconds": 30,
            "door_open_max_age_seconds": 10,
            "max_future_skew_seconds": 5,
            "recent_ids_remembered": 32,
        },
        "vectors": vectors,
        "sequences": sequences,
    }


def main():
    OUTPUT_PATH.write_text(json.dumps(generate(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
