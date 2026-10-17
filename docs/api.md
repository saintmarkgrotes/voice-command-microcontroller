# API Contract

The mobile app is built against this contract. The Flask backend must match it.

## Conventions

- Base path: `/api`. All requests and responses are JSON (`Content-Type: application/json`).
- Success responses contain `"success": true` (except `/api/health`).
- Error responses ALWAYS use this shape and never include stack traces:

      { "success": false, "error": { "code": "ERROR_CODE", "message": "Human-readable message" } }

- The app maps `error.code` to its own user-facing text, so `code` values must be stable.
- For local phone testing, set `HOST=0.0.0.0` so phones on the LAN can reach the backend.
- Enable CORS (Flask-CORS) for development; needed by Expo Web, harmless for native.
- Plain HTTP is acceptable on a local network for development only. Use HTTPS in production.

## Shared vocabulary

| Device | Commands               | Resulting state |
| ------ | ---------------------- | --------------- |
| light  | LIGHT_ON / LIGHT_OFF   | on / off        |
| fan    | FAN_ON / FAN_OFF       | on / off        |
| door   | DOOR_OPEN / DOOR_CLOSE | open / closed   |
| pump   | PUMP_ON / PUMP_OFF     | on / off        |

Initial states: light off, fan off, door closed, pump off.

## POST /api/auth/login

- Auth: none.
- Request: `{ "username": "alice", "password": "<password>" }`.
- Username is case-insensitive and trimmed for lookup. Both fields must be nonempty strings;
  username is limited to 64 characters and password to 128. Password whitespace is preserved.
- 200, with `Cache-Control: no-store`:

      {
        "success": true,
        "access_token": "<signed JWT>",
        "token_type": "Bearer",
        "expires_in": 3600,
        "user": { "username": "alice", "role": "admin" }
      }

  `expires_in` follows `ACCESS_TOKEN_TTL_SECONDS`. Roles are `admin` and `viewer`.
- Errors: 400 `INVALID_REQUEST`, 401 `INVALID_CREDENTIALS`, 429 `RATE_LIMITED`.
  Wrong passwords and unknown users share the same response. A locked-out IP or username
  gets 429 before the password is checked, with `Retry-After` in seconds.

## GET /api/health

- Auth: none
- 200: `{ "status": "ok" }`

## GET /api/status

- Auth: `Authorization: Bearer <token>`; admin or viewer.
- Successful responses include `Cache-Control: no-store`.
- 200:

      {
        "success": true,
        "devices": {
          "light": { "state": "off" },
          "fan":   { "state": "off" },
          "door":  { "state": "closed" },
          "pump":  { "state": "off" }
        }
      }

- Errors: 401 UNAUTHORIZED, 500 INTERNAL_ERROR, 503 SERVICE_UNAVAILABLE

## POST /api/commands

- Auth: `Authorization: Bearer <token>`; admin only.
- Checks run in this order: authenticate, authorize, rate limit, validate, process.
  The command limit defaults to 30 requests per user per 60 seconds; 429 includes `Retry-After`.
- Request:

      { "device": "light", "command": "LIGHT_ON" }

- 200:

      {
        "success": true,
        "command_id": "generated-id",
        "device": "light",
        "encrypted_payload": {
          "algorithm": "AES-256-GCM",
          "nonce": "<base64>",
          "ciphertext": "<base64>",
          "tag": "<base64>"
        }
      }

  On success the backend also updates its simulated device state (visible via GET /api/status).
  Device and command strings are trimmed and ASCII case-normalized. Extra request fields are
  ignored; command IDs and timestamps always come from the server.
  The response must NEVER contain the plaintext command as the payload, nor the AES key.
  The app rejects any 200 response whose `algorithm` is not `AES-256-GCM` or whose
  `nonce`, `ciphertext` or `tag` is missing or empty.

- Errors:

| Status | code                    | When                                                     |
| ------ | ----------------------- | -------------------------------------------------------- |
| 400    | INVALID_REQUEST         | Body is not a JSON object, or fields missing/not strings |
| 400    | INVALID_DEVICE          | Unknown device                                           |
| 400    | INVALID_COMMAND         | Unknown command ("Unsupported command.")                 |
| 400    | COMMAND_DEVICE_MISMATCH | Command does not belong to the device                    |
| 401    | UNAUTHORIZED            | Missing/invalid token                                    |
| 403    | FORBIDDEN               | Authenticated but not permitted                          |
| 404    | NOT_FOUND               | Unknown route                                            |
| 409    | CONFLICT                | Command conflicts with current state (optional)          |
| 413    | INVALID_REQUEST         | Request body exceeds 4 KB                                |
| 429    | RATE_LIMITED            | Too many requests                                        |
| 500    | INTERNAL_ERROR          | Unexpected server error (generic message only)           |
| 503    | SERVICE_UNAVAILABLE     | Temporarily unavailable                                  |

## Encrypted payload format (for the future ESP32)

The rules a receiver must follow, and test vectors to check an implementation against, are in
[esp32.md](esp32.md). `nonce` (12 bytes), `ciphertext` and `tag` (16 bytes) are Base64-encoded;
the key is 256-bit. The additional authenticated data is the ASCII string
`smart-home-command-v1`, supplied by both sides and not transmitted.

The plaintext is compact UTF-8 JSON with sorted keys:

```json
{"command":"LIGHT_ON","command_id":"<uuid>","device":"light","timestamp":1750000000}
```

`timestamp` is Unix time in seconds. The backend currently returns the encrypted payload
without delivering it to hardware. See [security.md](security.md) for deployment limitations.

Unknown routes return 404 `NOT_FOUND`; unsupported HTTP methods return 405
`METHOD_NOT_ALLOWED`. Unexpected failures return 500 `INTERNAL_ERROR` with a generic message.
