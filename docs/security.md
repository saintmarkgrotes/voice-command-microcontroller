# Security

This document explains how the backend protects device commands, why each
choice was made, and, just as important, what is **not** protected yet.

## 1. What is protected

A command such as `LIGHT_ON` is turned into an encrypted payload by the Flask
backend. The payload is safe to relay over any channel to the ESP32 because:

- **Confidentiality:** nobody without the key can read the command.
- **Integrity and authenticity:** nobody can change or forge a payload without
  the key. Any modification is detected on decryption.

## 2. AES-256-GCM

- **AES-256:** block cipher with a 256-bit key.
- **GCM (Galois/Counter Mode):** an authenticated-encryption mode. It encrypts
  and computes an authentication tag in one operation.
- **Not ECB, not custom:** ECB leaks patterns, and inventing an algorithm is
  unsafe. We use a standard mode from a well-maintained library (PyCryptodome).
- **Decryption verifies the tag first.** If the tag doesn't match, no plaintext
  is released. Wrong key, changed ciphertext, changed nonce, and changed tag
  all fail the same generic way, so a failure reveals nothing useful.

## 3. Payload format

```json
{
  "algorithm": "AES-256-GCM",
  "nonce": "<base64, 12 bytes>",
  "ciphertext": "<base64, same length as plaintext>",
  "tag": "<base64, 16 bytes>"
}
```

Plaintext (before encryption) is compact UTF-8 JSON with sorted keys:

```json
{"command":"LIGHT_ON","command_id":"<uuid>","device":"light","timestamp":1750000000}
```

**Additional authenticated data (AAD):** the fixed ASCII string
`smart-home-command-v1`. It is not transmitted, but decryption fails unless the
receiver supplies the exact same bytes. It ties ciphertexts to this protocol
and version. The full ESP32 decryption procedure is documented in Phase 19.

## 4. Nonces

- A **nonce** ("number used once") is 12 random bytes from the operating
  system's cryptographic random source, generated fresh for **every** message.
- Reusing a nonce with the same key breaks GCM: it can expose plaintext
  relationships and allow forgeries. We therefore never reuse or derive nonces
  from a counter that could reset.
- With random 96-bit nonces, the chance of any repeat after one million
  messages is on the order of 10^-17. NIST guidance allows up to 2^32 messages
  per key with random nonces; this system is far below that. If usage ever
  approaches it, rotate the key.

## 5. Authentication tags

The 16-byte tag is computed over the ciphertext, nonce and AAD using the key.
The receiver recomputes it. A mismatch means the data was altered, the key is
wrong, or the AAD differs, and the message must be rejected.

## 6. Key management

- The key is 32 random bytes, stored as 64 hex characters in the
  `AES_SECRET_KEY` environment variable (`backend/.env`).
- Generate with `python scripts/generate_key.py`.
- **Never** in: the React Native app, Git, API responses, logs, chat/tickets,
  or screenshots. `.env` is git-ignored; only `.env.example` (empty value) is
  committed.
- The app **refuses to start** if the key is missing or malformed, so it can
  never run with broken encryption. The startup error does not print the key.
- `EncryptionService.__repr__` hides the key so it can't leak into logs.
- **Rotation:** to replace a key, generate a new one, update the backend, and
  re-provision the ESP32. Old and new keys are not accepted at the same time in
  the current design. Rotate immediately if a key is exposed.

## 7. Why the key is not in React Native

Anything shipped inside a mobile app can be extracted: bundles can be unpacked,
memory can be inspected, and network traffic can be observed. A key in the app
would be a key in every user's hands. Instead the app sends a plain command
to the authenticated backend, and only the backend, which we control, holds the
key and encrypts.

## 8. Input validation and errors

- Every request is validated before use: JSON object, string fields, known
  device, known command, command belongs to the device (`app/utils/validators.py`).
- Input is normalized (trim, case) but non-ASCII text is rejected rather than
  case-mapped, avoiding Unicode lookalike tricks.
- Request bodies over 4 KB are rejected.
- The **server** generates `command_id` and `timestamp`; client-supplied values
  are ignored.
- Errors use one JSON shape with fixed messages. Framework messages, stack
  traces, and exception text are never returned; details go to the server log.
- API responses contain only the encrypted payload, never the plaintext
  command and never the key.

## 9. Known limitations (current stage)

| Gap | Status |
|---|---|
| Phone to Flask uses plain HTTP on the local network | Acceptable for development only. **Use HTTPS in production.** |
| No authentication yet | Endpoints are open until Phase 13. Do not expose this server beyond your LAN. |
| Replay protection | Payloads carry `command_id` and `timestamp`, but enforcement (reject stale/duplicate commands) is the ESP32's job in a later stage. |
| No rate limiting yet | Planned in Phase 13. |
| Key provisioning to the ESP32 | Not designed yet (Phase 19). The device needs a secure, one-time way to receive the key. |
| Simulated device state | Backend state is in memory and resets on restart. |

## 10. How this is verified

`backend/tests/test_encryption_service.py` proves:

| Claim | Test |
|---|---|
| Encryption works, payload well-formed | `test_encrypt_returns_well_formed_payload` |
| Correct key decrypts | `test_round_trip_*` |
| Wrong key fails | `test_decrypt_with_wrong_key_fails` |
| Tampering fails | `test_modified_field_fails_authentication`, truncation, swapped tags |
| Fresh nonce each time | `test_every_encryption_uses_a_fresh_nonce` |
| Plaintext not exposed | `test_plaintext_is_not_present_in_payload`, `test_api_response_never_contains_the_key` |
| AAD is enforced | `test_aad_must_match_to_decrypt` |
| Standard GCM (ESP32-compatible) | `test_payload_decrypts_with_a_raw_gcm_implementation` |
| Bad keys rejected, no key leaks | key-handling and startup tests |