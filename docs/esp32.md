# ESP32 Interface Specification

This document tells a firmware developer exactly what the ESP32 must do with the commands the
backend produces. **No firmware exists yet.** This file, the test vectors and the tests that
tie them to the backend are everything the future firmware has to match.

Read [api.md](api.md) (payload format) and [security.md](security.md) (why) alongside this file.

## 1. What is decided and what is not

| Topic | Status |
| ----- | ------ |
| Encrypted payload format, key size, nonce, tag, context string | **Fixed** (this document and the backend) |
| What the ESP32 must check, and in what order | **Fixed** (section 4, with test vectors) |
| Replay protection rules (ids and freshness) | **Fixed** (section 5) |
| How the payload gets to the device | **To decide** (section 6, with a recommendation) |
| How the key gets onto the device | **To decide** (section 7, with a recommendation) |
| How the device reports the result back | **To decide** (section 8, proposal) |

Anything marked "to decide" needs a decision from the project owner before firmware or backend
work starts. The backend does not send anything to a device today: it stops at the encrypted
payload and returns it to the app.

## 2. The message the device receives

The device receives the same JSON object the backend returns as `encrypted_payload`:

```json
{
  "algorithm": "AES-256-GCM",
  "nonce": "<base64, 12 bytes>",
  "ciphertext": "<base64, 1 to 256 bytes>",
  "tag": "<base64, 16 bytes>"
}
```

Exactly these four fields, all strings. After decryption the plaintext is UTF-8 JSON with
exactly these four fields:

| Field | Type | Meaning |
| ----- | ---- | ------- |
| `command` | string | One of `LIGHT_ON`, `LIGHT_OFF`, `FAN_ON`, `FAN_OFF`, `DOOR_OPEN`, `DOOR_CLOSE`, `PUMP_ON`, `PUMP_OFF` (exact case) |
| `device` | string | `light`, `fan`, `door` or `pump`; must be the device that owns `command` |
| `command_id` | string | Unique per command (the backend uses a UUID); 1 to 64 characters |
| `timestamp` | integer | Unix time in seconds (UTC) from the backend's clock |

The backend writes the keys in alphabetical order without spaces. A receiver must **not** depend
on key order or spacing; it parses the JSON.

## 3. Cryptographic parameters

| Item | Value |
| ---- | ----- |
| Algorithm | AES-256-GCM |
| Key | 32 bytes (the backend's `AES_SECRET_KEY`, 64 hex characters) |
| Nonce (IV) | 12 bytes, random, new for every message, sent as Base64 |
| Tag | 16 bytes, sent as Base64 |
| Additional authenticated data (AAD) | the 21 ASCII bytes `smart-home-command-v1`, **not transmitted**, no terminator |
| Ciphertext | Base64, same length as the plaintext |

The ESP32 has hardware AES, and mbed TLS (bundled with ESP-IDF) provides AES-GCM with an
authenticated-decrypt operation that takes the key, nonce, AAD, ciphertext and tag together and
refuses to output plaintext when the tag does not match. Use that kind of single call. Never
decrypt first and compare the tag afterwards.

## 4. What the device must do, in this order

Each step either passes or rejects the message. A rejected message is **dropped silently**:
nothing is executed, and no detail is sent back to whoever sent it. (A counter or a local debug
log of the reason is fine; never log the key or the plaintext of a message that failed.)

| Step | Check | Reject reason |
| ---- | ----- | ------------- |
| 1 | The message is a JSON object with exactly the four fields, all strings, and `algorithm` equals `AES-256-GCM` | `bad_envelope` |
| 2 | The three Base64 fields decode strictly (no stray characters) | `bad_encoding` |
| 2 | Nonce is exactly 12 bytes, tag exactly 16, ciphertext 1 to 256 bytes (checked **before** any cryptography) | `bad_length` |
| 3 | Authenticated decryption with the key, nonce and the AAD above succeeds | `auth_failed` |
| 4 | The plaintext is a JSON object with exactly `command`, `command_id`, `device`, `timestamp`; the first three are strings, `timestamp` is an integer (not text, not a fraction); `command_id` is 1 to 64 characters | `bad_plaintext` |
| 5 | `command` is one of the eight known commands (no case changes, no trimming) | `unknown_command` |
| 5 | `device` is the device that owns `command` | `device_mismatch` |
| 6 | The device clock is synchronized. If not, reject everything | `no_trusted_time` |
| 6 | `timestamp` is not more than 5 seconds ahead of the device clock | `future` |
| 6 | The message is not too old: age = now minus `timestamp` must be at most **30 seconds**, or at most **10 seconds** for `DOOR_OPEN` | `stale` |
| 7 | `command_id` is not among the last 32 accepted ids. Remember the id only after every check above has passed | `duplicate` |
| 8 | Act on the command | (accepted) |

Notes:

- "Age at most 30" means a message exactly 30 seconds old is accepted and 31 is not. The vectors
  test both edges.
- Only `DOOR_OPEN` gets the strict window. Opening a door is the one command where a captured
  message replayed late is a real physical risk. `DOOR_CLOSE`, the light, the fan and the pump
  use the normal window.
- A device must also check that it actually controls the named `device` (a single-purpose unit
  ignores commands for other devices).
- Commands are idempotent: `LIGHT_ON` on a light that is already on is not an error.

## 5. Replay protection

An attacker who captures one valid message cannot change it (the tag would fail), but can send it
again. Two independent rules stop that, and both are required:

1. **Freshness.** Old messages are refused (step 6). This needs a trustworthy clock: synchronize
   with SNTP at start-up and periodically, and treat the clock as untrusted until the first
   successful sync. With no trusted time the device refuses everything. That is deliberately
   strict; it can be relaxed per command later if the owner accepts the risk.
2. **Duplicate ids.** Keep the last 32 accepted `command_id` values in RAM and refuse repeats
   (step 7). Size the list as: number of admin users x the backend's `COMMAND_RATE_LIMIT`
   per minute x (the longest window in seconds / 60), plus some margin. With the defaults
   (30 per minute, 30 second window) one admin needs at most 15 entries and 32 covers two
   admins. Enlarge it if you add admins or raise the limits.

After a reboot the id list is empty, so a message captured shortly before the reboot could be
replayed once more, but only for as long as the freshness window lasts (30 seconds, 10 for
`DOOR_OPEN`). That is why the clock must be trusted again before accepting anything. Persisting
ids in flash is not recommended (wear, and it only closes a 30 second gap).

The nonce is not used for replay detection. It exists only so the same key never encrypts two
messages with the same nonce.

## 6. How the message reaches the device (to decide)

| Option | How it works | Good | Watch out for |
| ------ | ------------ | ---- | ------------- |
| **A. MQTT over TLS** (recommended) | The backend publishes the payload to a topic per device; the ESP32 keeps a connection to the broker and subscribes | Works behind home routers, near-instant, standard on ESP32 | A broker to run; the broker is untrusted for content because of AES-GCM, but still needs access control and TLS |
| B. Device polls the backend | The ESP32 asks `GET /api/...` every few seconds for pending commands | No broker, simple | Needs a pending-command queue and device authentication in the backend, and a delay equal to the polling period |
| C. Backend calls the device | The backend sends an HTTP request to the ESP32 on the local network | Simplest to demo | Needs a reachable address, an HTTP server on the device and stronger local network assumptions |

Whatever the transport, the message body is the JSON in section 2, unchanged. Do not add fields:
the receiver rejects extra fields. Routing information (which device) belongs in the topic or URL,
not in the body.

Because the freshness window is 30 seconds, the transport must deliver quickly or drop. A queue
that holds commands for minutes would make every delayed command `stale`, which is the intended
behavior.

## 7. Getting the key onto the device (to decide)

Today the backend uses one key for everything. Recommended direction, not implemented:

- **Per-device keys.** Keep one master secret in the backend and derive each device's key from
  it with HKDF, using the device id as context. The backend never stores many keys, and a stolen
  device exposes only its own key. This needs the backend to know which device a command is for
  and to encrypt with that device's key (the `device` field in the plaintext already helps).
- **Provision once, locally.** Write the key during first-time setup over a cable or a trusted
  local connection, never over the internet and never in a firmware image that is committed to
  Git.
- **Protect it on the chip.** Enable ESP32 flash encryption and secure boot, store the key in
  encrypted NVS storage, and disable debug access (JTAG) on production units. Never print the
  key or write it to logs.
- **Rotation.** Replacing the key means updating the backend and re-provisioning every device
  that uses it. Plan for how a lost or stolen device is revoked.

If the plaintext format ever changes, bump the AAD string (`smart-home-command-v2`) so old and
new devices cannot be confused.

## 8. Reporting the result back (proposal)

Today the backend updates its simulated device state the moment it encrypts a command, before
any device acts. With real hardware that is optimistic. Proposed change:

- The device sends back an acknowledgement for each accepted (or rejected) command containing
  `command_id`, `device`, the resulting `state`, and its own `timestamp`.
- Protect it the same way: AES-256-GCM, a different AAD such as `smart-home-state-v1`, and a
  random nonce from the ESP32's hardware random generator. Preferably use a separate key for
  the device-to-backend direction so that the two sides can never reuse a nonce under the same
  key.
- The backend then sets the state from acknowledgements, and `GET /api/status` could report a
  `pending` state until one arrives. This changes the API and the app's device cards, so it is a
  separate piece of work.

## 9. Safety recommendations for the firmware

- Start in a safe state after power-up or reset, and do not assume the door position.
- Put a maximum run time on the pump even when the command says only "on".
- Apply physical limits and debounce in the firmware, independent of what a command says.
- Keep a manual override that does not depend on the network.
- Rate-limit the device itself (for example ignore more than a few commands per second) so a
  flood of valid-looking traffic cannot wear out hardware.

## 10. A worked example (the vector `accept_door_open_age_10_boundary`)

Public test data, not a secret:

| Item | Value |
| ---- | ----- |
| Key (hex) | `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f` |
| AAD | `smart-home-command-v1` |
| Device clock (`now`) | `1750000100` |

Message:

```json
{
  "algorithm": "AES-256-GCM",
  "nonce": "AAAAAAAAAAAAAAAL",
  "ciphertext": "nzM80vI1j48MFWtH9HHgj0CJZOWuTyw/XLH6wxeHHQzvBAWGraL7eOmtJZK6p2P39cIrWqO0txBBNzfI6+3LUCWdx/lRMnP/dyjSQaMW6dqTBVNHFMqRaqXc5VUXFBm7VzRfqof0/wXl6X+kVo5pg9ND",
  "tag": "HPHFWMfuSU3zOi0+txGpKQ=="
}
```

Decrypting it gives:

```json
{"command":"DOOR_OPEN","command_id":"00000000-0000-4000-8000-000000000011","device":"door","timestamp":1750000090}
```

The age is 1750000100 - 1750000090 = 10 seconds, exactly the `DOOR_OPEN` limit, so the message is
accepted. The same message with `timestamp` 1750000089 (age 11) must be rejected as `stale`;
that is the vector `reject_door_open_age_11`.

## 11. Test vectors

`docs/esp32-test-vectors.json` contains known messages with the expected result. Load it in your
firmware test setup and check every entry:

```text
test_key_hex        the key to use (public test key, never for real devices)
aad                 the context string
rules               the numbers from section 4 and 5
vectors[]           name, now (device clock, or null = unsynchronized), envelope, expect
                    expect = { "result": "accept" }  or  { "result": "reject", "reason": "..." }
                    accepted vectors also carry the expected "plaintext"
sequences[]         ordered messages sharing one list of remembered ids
```

Start each single vector with an empty id list; start each sequence with an empty list and keep
it across the messages in that sequence. The file covers all eight commands, the freshness edges,
every cryptographic failure (tampered ciphertext, tag and nonce; wrong key; wrong context;
truncation), malformed envelopes and plaintexts, and replays.

Your receiver passes when it gives the same accept or reject, **and the same reason**, for every
entry. The reason names are exactly: `bad_envelope`, `bad_encoding`, `bad_length`,
`auth_failed`, `bad_plaintext`, `unknown_command`, `device_mismatch`, `no_trusted_time`,
`future`, `stale`, `duplicate`.

How the file stays honest:

- `backend/scripts/make_test_vectors.py` creates it with a plain AES-GCM library and the format
  above, using fixed nonces, so it never changes unless the rules change.
- `backend/tests/test_esp32_vectors.py` checks that the committed file equals the generator's
  output, that a reference model of this pipeline (Python, test code only) gives the expected
  result for every vector, that the backend's own decryption agrees on the good and the
  tampered messages, and that real output from the running backend passes the same pipeline.
- To regenerate after a deliberate change: from `backend/`, run
  `python -m scripts.make_test_vectors`, then update this document.

## 12. When the ESP32 work starts

1. Decide sections 6, 7 and 8.
2. Add the backend side: sending to the device, per-device keys if chosen, and reading
   acknowledgements.
3. Write the firmware to this document and pass every test vector.
4. Run the live end-to-end test again with the real device in the loop, and update
   `docs/security.md` and `docs/architecture.md`.