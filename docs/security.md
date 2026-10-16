# Security

This document explains how the system protects device commands, why each choice was made,
and, just as important, what is **not** protected yet.

## 1. The big picture

```text
Phone (React Native)                 Flask backend                      ESP32 (future)
────────────────────                 ─────────────                      ──────────────
sign in  ───────────────────────────► check password (hash)
         ◄──────────── signed token ──
command  ── plaintext + token ──────► check token, role, rate limit
                                       validate the command
                                       add id + timestamp
                                       encrypt with AES-256-GCM ───────► decrypt, verify,
         ◄──── encrypted payload ──── (key never leaves the backend)      then act
```

| Link                    | Protected by                                    | Status                         |
| ----------------------- | ----------------------------------------------- | ------------------------------ |
| Phone to backend        | Signed login token, roles, rate limits          | Plain HTTP in development, **use HTTPS in production** |
| Backend to ESP32        | AES-256-GCM encrypted, authenticated payload    | Backend side done; ESP32 not built yet |
| Backend secrets         | Environment variables only, never in Git        | Done                           |

Two things to understand clearly:

- **AES protects the backend-to-ESP32 leg.** The phone sends the plain command to the
  backend, so the phone-to-backend leg is only as safe as the network. On plain HTTP, anyone
  on the same Wi-Fi who can capture traffic can read the command and the login token.
  HTTPS fixes this and is required before real use.
- **The login token is the key to the front door.** Whoever holds a valid token can do what
  its role allows until it expires.

## 2. AES-256-GCM

- **AES-256:** block cipher with a 256-bit key.
- **GCM (Galois/Counter Mode):** an authenticated-encryption mode. One operation gives
  confidentiality (nobody can read the command) and integrity and authenticity (nobody can
  change or forge it without the key).
- **Not ECB, not custom:** ECB leaks patterns and inventing an algorithm is unsafe. We use a
  standard mode from a well-maintained library (PyCryptodome).
- **Verification comes first.** If the tag does not match, no plaintext is released. A wrong
  key, a changed ciphertext, a changed nonce, a changed tag and a wrong context all fail the
  same generic way, so a failure reveals nothing useful.

## 3. Payload format

```json
{
  "algorithm": "AES-256-GCM",
  "nonce": "<base64, 12 bytes>",
  "ciphertext": "<base64, same length as plaintext>",
  "tag": "<base64, 16 bytes>"
}
```

Plaintext before encryption is compact UTF-8 JSON with sorted keys:

```json
{"command":"LIGHT_ON","command_id":"<uuid>","device":"light","timestamp":1750000000}
```

**Additional authenticated data (AAD):** the ASCII string `smart-home-command-v1`. It is not
transmitted, but decryption fails unless the receiver supplies the exact same bytes. It ties
a ciphertext to this protocol and version. If the plaintext format ever changes, bump the
suffix. The step-by-step ESP32 procedure is in [esp32.md](esp32.md).

## 4. Nonces

- A **nonce** ("number used once") is 12 random bytes from the operating system's
  cryptographic random source, generated fresh for **every** message.
- Reusing a nonce with the same key breaks GCM: it can expose relationships between messages
  and allow forgeries. Nonces are never reused and never derived from a counter that could
  reset.
- With random 96-bit nonces the chance of any repeat after one million messages is around
  10^-17. NIST guidance allows up to 2^32 messages per key with random nonces; this system is
  far below that. If usage ever approaches it, rotate the key.

## 5. Authentication tags

The 16-byte tag is computed over the ciphertext, the nonce and the AAD using the key. The
receiver recomputes it. A mismatch means the data was altered, the key is wrong or the AAD
differs, and the message must be rejected.

## 6. Key and secret management

| Name             | What it is                                      | Where it lives          | How to create it                |
| ---------------- | ----------------------------------------------- | ----------------------- | ------------------------------- |
| `AES_SECRET_KEY` | 256-bit key, 64 hex characters, encrypts commands | `backend/.env`        | `python scripts/generate_key.py` |
| `JWT_SECRET_KEY` | At least 32 characters, signs login tokens. **Must differ from the AES key** | `backend/.env` | `python scripts/generate_key.py` |
| `AUTH_USERS`     | `username\|role\|password_hash` entries separated by `;` | `backend/.env` | `python -m scripts.create_user` |

Rules:

- Never put these in: the React Native app, Git, API responses, logs, chats, tickets or
  screenshots. `.env` files are git-ignored; only the `.env.example` templates (with empty
  values) are committed.
- The app **refuses to start** if a key is missing, too short, malformed, or if the two keys
  are equal, so it can never run with broken security. Startup errors never print the secret.
- `EncryptionService` and `AuthService` hide their secrets from `repr()` so they cannot leak
  into logs or tracebacks.
- **Rotation:** generate a new value, update `backend/.env`, restart the backend. A new
  `JWT_SECRET_KEY` signs everyone out. A new `AES_SECRET_KEY` must also be provisioned to the
  ESP32; the two are not accepted side by side. Rotate immediately if a secret is exposed.
  (For example, a zipped project containing `.env` files counts as shared.)

## 7. Why the AES key is not in React Native

Anything shipped inside a mobile app can be extracted: bundles can be unpacked, memory can be
inspected and traffic can be observed. A key in the app would be a key in every user's hands.
Instead the app sends a plain command to the authenticated backend, and only the backend,
which we control, holds the key and encrypts. For the same reason `EXPO_PUBLIC_*` variables
(which are baked into the app) must never hold secrets.

## 8. Authentication (who are you?)

- **Passwords** are stored only as salted hashes (scrypt, through Werkzeug). The password
  itself is never stored or logged. `python -m scripts.create_user` asks for it hidden and
  requires 10 to 128 characters.
- **Login** (`POST /api/auth/login`) returns a signed token (JWT, HS256) valid for
  `ACCESS_TOKEN_TTL_SECONDS` (default 1 hour).
- **Token contents:** issuer, audience, username, role, issued-at, expiry and a unique id.
  Only the `HS256` algorithm is accepted, so unsigned or re-signed tokens are refused.
- **Verification on every request:** signature, expiry, issuer, audience, all required
  claims, and the user must still exist with the same role. Removing a user (or changing
  the role) in `AUTH_USERS` and restarting the backend ends that user's access immediately.
- **One generic answer:** every token failure (garbage, expired, wrong key, unknown user)
  gets the identical `401 UNAUTHORIZED`, which tells an attacker nothing.
- **No user enumeration:** a wrong password and an unknown username give the identical
  response, and unknown usernames are checked against a real hash of the same cost, so the
  response time does not reveal whether a username exists.
- **Stateless tokens, no refresh tokens, no server-side logout.** The app deletes its copy
  on sign-out and the token expires by itself. For an immediate cut-off, rotate
  `JWT_SECRET_KEY`.

## 9. Authorization (what may you do?)

| Role   | Read status | Send commands |
| ------ | ----------- | ------------- |
| admin  | yes         | yes           |
| viewer | yes         | no            |

Checks run in a fixed order: authenticate, authorize, rate limit, validate, process. A
viewer's command is refused with 403 before its content is even looked at, and a refused
request never changes device state or produces an encrypted payload. The app also disables
the controls for viewers, but the backend is the authority.

## 10. Rate limiting

- **Login:** 5 failed attempts in 5 minutes lock the client IP and the username. While locked,
  even the correct password is refused (`429`, with `Retry-After`). A successful login resets
  only the username counter, so an attacker cannot clear the IP counter by logging in to their
  own account between guesses.
- **Commands:** 30 per minute per user.
- Limits live in memory: they reset on restart and are not shared between processes. Use a
  shared store (for example Redis) if the backend ever runs with several workers. Locking a
  username can also be used to lock out its real owner for a few minutes; that is the usual
  trade-off.

## 11. Input validation

- Every request is checked before use: a JSON object, string fields, known device, known
  command, and a command that belongs to the device (`backend/app/utils/validators.py`).
- Input is normalized (trim, case) but non-ASCII text is rejected rather than case-mapped,
  which avoids Unicode look-alike tricks. Login fields have length limits so huge passwords
  cannot be fed to the slow hash function.
- Request bodies over 4 KB are rejected.
- The **server** creates `command_id` and `timestamp`; client-supplied values are ignored.
- The app validates too (and its voice parser refuses negations, questions and ambiguous
  phrases), but only as a convenience: the backend repeats every check.

## 12. Errors and logging

- Errors use one JSON shape with fixed messages. Framework messages, exception text and stack
  traces are never returned; details go to the server log only.
- Responses never contain the plaintext command, the AES key, the JWT secret, passwords or
  hashes. Tests scan the login, status, command and error responses for these.
- Login and status responses are sent with `Cache-Control: no-store`.

## 13. On the phone

- The login token is stored with `expo-secure-store` (iOS Keychain / Android Keystore),
  **never** in AsyncStorage, which is plain text. Without SecureStore (Expo web) the session is
  kept in memory only and is lost on reload.
- The password is never stored. After a rejected login the password field is cleared.
- A saved session that is expired, corrupt or tampered with is ignored and deleted.
- A `401` on a request that carried a token returns the user to the login screen. A late `401`
  for an older token cannot end a newer session.
- The login screen warns when the backend URL uses plain `http://`.

## 14. Known limitations (current stage)

| Gap                                                         | Status |
| ----------------------------------------------------------- | ------ |
| Phone to backend uses plain HTTP on the local network       | Acceptable for development only. **Use HTTPS in production.** |
| No server-side logout or token revocation list              | Tokens expire by themselves; rotate `JWT_SECRET_KEY` for an emergency cut-off |
| No refresh tokens                                           | Users sign in again after expiry |
| Replay protection is not enforced by the backend            | Payloads carry `command_id` and `timestamp`; rejecting duplicate or stale commands is the ESP32's job, with exact rules in [esp32.md](esp32.md)  |
| Key provisioning to the ESP32 is not decided yet            | Options and a recommendation (per-device keys, flash encryption) are in [esp32.md](esp32.md) |
| Rate limits are per process and in memory                   | Fine for one server process |
| Device state is simulated in memory                         | Resets on restart; becomes ESP32 feedback later |
| Flask development server                                    | Use a production WSGI server and a reverse proxy with HTTPS for real deployments |
| No audit log of who sent which command                      | Not implemented |

## 15. Before real use (checklist)

- [ ] HTTPS in front of the backend, and an `https://` `EXPO_PUBLIC_API_URL`.
- [ ] `APP_ENV=production`, `CORS_ORIGINS` set to the real origins (not `*`).
- [ ] New `AES_SECRET_KEY` and `JWT_SECRET_KEY`, and real users from `create_user`.
- [ ] A production WSGI server instead of `python run.py`.
- [ ] ESP32 side: decrypt with the documented format, reject stale and duplicate commands.
- [ ] Remove test users and shell variables such as `E2E_*_PASSWORD`.

## 16. How this is verified

| Claim                                          | Where                                                       |
| ---------------------------------------------- | ----------------------------------------------------------- |
| Encryption works, wrong key and tampering fail | `backend/tests/test_encryption_service.py`                  |
| Fresh nonce every time, no plaintext exposed   | `backend/tests/test_encryption_service.py`                  |
| A plain AES-GCM receiver can decrypt, and rejects tampering, a wrong key or wrong context | `backend/tests/test_integration.py` |
| Tokens: expiry, tampering, `none` algorithm, missing or wrong claims, removed users | `backend/tests/test_auth.py` |
| Roles and request order                        | `backend/tests/test_auth.py`, `backend/tests/test_integration.py` |
| Login lockout and command limit                | `backend/tests/test_rate_limit.py`                          |
| No secret appears in any response              | `backend/tests/test_integration.py`                         |
| Secure token storage, expiry and corrupt data  | `src/services/__tests__/tokenStorage.test.js`               |
| Session handling and stale 401s                | `src/context/__tests__/AuthContext.test.js`                 |
| App and backend work together                  | `e2e/api-flow.e2e.test.js`                                  |
| The ESP32 rules and test vectors match the backend | `backend/tests/test_esp32_vectors.py`                   |

## 17. Reporting and housekeeping

- If you think a secret leaked, rotate it first, investigate second.
- Do not paste `.env` contents into chats or tickets. Usernames and roles are enough for
  support, and `python -m scripts.create_user` can always make a fresh entry.
- Keep dependencies up to date and run all test suites after upgrading.