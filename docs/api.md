# API Contract

The mobile app is built against this contract. The Flask backend must match it.

## Conventions

- Base path: `/api`. All requests and responses are JSON (`Content-Type: application/json`).
- Success responses contain `"success": true` (except `/api/health`).
- Error responses ALWAYS use this shape and never include stack traces:

      { "success": false, "error": { "code": "ERROR_CODE", "message": "Human-readable message" } }

- The app maps `error.code` to its own user-facing text, so `code` values must be stable.
- The backend must listen on `0.0.0.0` (not only `127.0.0.1`) so phones on the LAN can reach it.
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

## GET /api/health

- Auth: none
- 200: `{ "status": "ok" }`

## GET /api/status

- Auth: `Authorization: Bearer <token>` once authentication is implemented
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

- Auth: `Authorization: Bearer <token>` once authentication is implemented
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
| 429    | RATE_LIMITED            | Too many requests                                        |
| 500    | INTERNAL_ERROR          | Unexpected server error (generic message only)           |
| 503    | SERVICE_UNAVAILABLE     | Temporarily unavailable                                  |

## Encrypted payload format (for the future ESP32)

`nonce` (12 bytes), `ciphertext` and `tag` (16 bytes) are Base64-encoded, and the key is
256-bit. The exact plaintext layout and any associated data are finalized when the
backend encryption service is built and will be documented here.
