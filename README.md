# Secure Voice-Controlled Smart Home

A React Native app that controls smart-home devices by button or by voice, talking to a Flask
backend that checks who you are, validates each command and encrypts it with AES-256-GCM,
ready for an ESP32 microcontroller to receive.

> **Status:** the app, the backend, authentication, encryption, simulated device state, voice
> parsing and tests are done. **The ESP32 firmware and real hardware are not built yet.** The
> backend stops at the encrypted command.

## What it does

- Control a **light, fan, door and water pump** (on/off, open/close) from a dashboard.
- **Voice commands**: say or type "turn on the light"; unclear or risky phrases such as
  "don't open the door" send nothing. (Real speech recognition is not installed yet; a typed
  "mock voice" input stands in for the microphone.)
- **Sign in** with a username and password. Two roles: *admin* can control devices, *viewer*
  can only watch.
- Every command is **encrypted by the backend** (AES-256-GCM). The app never holds the key.
- Handles outages gracefully: it shows the last known state, supports pull-to-refresh, and has
  a built-in **mock backend** so you can try the app without a server.

```text
Phone (React Native)  ──HTTP + token──►  Flask backend  ──encrypted command──►  (future) ESP32
  buttons / voice                        authenticate • authorize • validate • AES-256-GCM
```

## What you need

- **Node.js** 20 LTS or newer, and npm
- **Python** 3.10 or newer (for the backend)
- The **Expo Go** app on your phone, or an Android emulator / iOS simulator
- Your phone and computer on the **same Wi-Fi** (when using the real backend on a phone)

## Quick start A: try the app with no backend

```powershell
npm install
npx expo start
```

Scan the QR code with Expo Go. With no `.env` file the app uses its built-in mock backend and
skips login.

## Quick start B: run the real backend

**1. Backend** (Windows PowerShell; on macOS/Linux use `python3`, `source venv/bin/activate`
and `cp`)

```powershell
cd backend
python -m venv venv
venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
copy .env.example .env
```

Fill in `backend/.env`:

```powershell
python scripts/generate_key.py      # paste the output as AES_SECRET_KEY=
python scripts/generate_key.py      # run again; paste as JWT_SECRET_KEY= (a different value)
python -m scripts.create_user       # paste the AUTH_USERS='...' line it prints
```

Rules for `AUTH_USERS`: **one line**, wrapped in **single quotes**, several users separated by
`;` inside the quotes, for example `AUTH_USERS='alice|admin|<hash>;bob|viewer|<hash>'`.
Then start the server:

```powershell
python run.py
```

Check it: open `http://127.0.0.1:5000/api/health`. You should see `{"status":"ok"}`.

**2. App** (a second terminal, in the repository root). Find your computer's Wi-Fi address with
`ipconfig` (the IPv4 Address of the Wi-Fi adapter), then create a file named `.env`:

```text
EXPO_PUBLIC_USE_MOCK_API=false
EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:5000
```

```powershell
npm install
npx expo start -c
```

Sign in with a user you created. Android emulator: use `http://10.0.2.2:5000`. iOS simulator:
`http://localhost:5000`. Restart with `-c` after every `.env` change.

## Configuration

**Backend** (`backend/.env`; template in `backend/.env.example`)

| Variable | Required | Meaning |
| -------- | -------- | ------- |
| `AES_SECRET_KEY` | yes | 256-bit key as 64 hex characters. Encrypts commands |
| `JWT_SECRET_KEY` | yes | 32 or more characters, **different** from the AES key. Signs login tokens |
| `AUTH_USERS` | yes | `username\|role\|password_hash` entries separated by `;` (roles: `admin`, `viewer`) |
| `APP_ENV` | no | `development` turns on debug mode; anything else is production mode |
| `HOST`, `PORT` | no | Default `127.0.0.1` and `5000`. Use `0.0.0.0` so a phone can connect |
| `CORS_ORIGINS` | no | Allowed origins, comma separated; `*` for development only |
| `ACCESS_TOKEN_TTL_SECONDS` | no | Login lifetime, default 3600 |
| `LOGIN_MAX_FAILURES`, `LOGIN_WINDOW_SECONDS` | no | Login lockout, default 5 failures per 300 s |
| `COMMAND_RATE_LIMIT`, `COMMAND_RATE_WINDOW_SECONDS` | no | Commands per user, default 30 per 60 s |

**App** (`.env` in the repository root; template in `.env.example`)

| Variable | Meaning |
| -------- | ------- |
| `EXPO_PUBLIC_USE_MOCK_API` | `false` for the real backend; anything else (or unset) uses the mock |
| `EXPO_PUBLIC_API_URL` | Backend address, for example `http://192.168.1.20:5000` |

Never put secrets in `EXPO_PUBLIC_*` variables: they are baked into the app. `.env` files are
git-ignored; do not commit or share them.

## Voice commands

Say or type short phrases. Examples that work:

| Phrase | Command |
| ------ | ------- |
| "turn on the light", "switch on the light", "lights on" | `LIGHT_ON` |
| "turn off the light", "lights off" | `LIGHT_OFF` |
| "turn on the fan", "fan off", "stop the fan" | `FAN_ON`, `FAN_OFF` |
| "open the door", "close the door", "shut the door" | `DOOR_OPEN`, `DOOR_CLOSE` |
| "turn on the water pump", "pump off" | `PUMP_ON`, `PUMP_OFF` |

Refused on purpose (nothing is sent): negations ("don't open the door"), questions ("is the
light on"), conditions ("open the door when I say"), two devices at once, and actions a device
does not have ("open the light"). The word lists are in `src/services/voice/voiceGrammar.js`.

## Running the tests

| Suite | Command | Needs a server? |
| ----- | ------- | --------------- |
| Backend | `cd backend`, activate the venv, then `pytest -q` | no |
| App | `npm test` | no |
| App against a live backend | `npm run test:e2e` | yes |
| Lint | `npx expo lint` | no |

At the time of writing: backend 195 tests, app 232 tests, end-to-end 21 tests.

For `npm run test:e2e`, start the backend, create dedicated **test** users (one admin, one
viewer), and set these in the same PowerShell window, using **single quotes**:

```powershell
$env:E2E_API_URL = 'http://127.0.0.1:5000'
$env:E2E_ADMIN_USER = 'test-admin'
$env:E2E_ADMIN_PASSWORD = 'its-password'
$env:E2E_VIEWER_USER = 'test-viewer'
$env:E2E_VIEWER_PASSWORD = 'its-password'
npm run test:e2e
Remove-Item Env:E2E_ADMIN_PASSWORD, Env:E2E_VIEWER_PASSWORD
```

It sends real commands (and switches every device back off afterwards), so never aim it at a
production system. Wait about a minute between runs: one run uses most of the 30-commands-per-
minute allowance. The viewer variables are optional.

## Project structure

```text
App.js, index.js, app/        App entry, providers and configuration
src/                          The mobile app (api, components, context, hooks, screens, services, utils)
e2e/                          Test of the app against a live backend
backend/                      Flask API (app, scripts, tests)
docs/                         architecture.md, api.md, security.md
```

Details are in [docs/architecture.md](docs/architecture.md).

## Documentation

- [docs/architecture.md](docs/architecture.md): how the pieces fit, flows and design decisions
- [docs/api.md](docs/api.md): every endpoint, request, response and error
- [docs/security.md](docs/security.md): AES-GCM, tokens, keys, limits and what is not protected yet

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| `pytest` (or `python run.py`) says a module or command is not found | The virtual environment is not active. In `backend/` run `venv\Scripts\Activate.ps1`; the prompt should start with `(venv)` |
| Backend exits with `Encryption is not configured` | `AES_SECRET_KEY` is missing or is not exactly 64 hex characters |
| Backend exits with `Authentication is not configured` | `JWT_SECRET_KEY` is missing, shorter than 32 characters or equal to the AES key, or `AUTH_USERS` is missing or malformed |
| `AUTH_USERS` is ignored or only one user works | It must be **one line**, in **single quotes**, with `;` between entries. A second `AUTH_USERS=` line replaces the first. Restart the backend after editing `.env` |
| "Incorrect username or password" | The user is not in the running server's `AUTH_USERS`, or the password is wrong. Restart the backend after changing `.env` |
| "Too many failed attempts" / `RATE_LIMITED` | Wait the `Retry-After` time (about 5 minutes for logins, 1 minute for commands) or restart the backend |
| App says "backend took too long" or "unable to connect" | The phone cannot reach the computer. Check the LAN IP (`ipconfig`), same Wi-Fi, no VPN, and that `HOST=0.0.0.0`. Open `http://<LAN-IP>:5000/api/health` in the phone's browser. On Windows allow Python through the firewall for private networks (`Get-NetConnectionProfile` should show `Private`). On iPhone turn on Local Network for Expo Go |
| App ignores `.env` changes | Restart with `npx expo start -c` |
| App shows "session expired" right after signing in | The token has expired or the user was removed from `AUTH_USERS` |
| Viewer sees disabled buttons | Expected: viewers can only watch. Use an admin account to control devices |

## Roadmap

- ESP32 firmware and hardware integration (Phase 19 defines the interface)
- Real speech recognition (needs a development build; the typed mock input stands in today)
- HTTPS and a production server setup (see the checklist in `docs/security.md`)

## License

`LICENSE` currently holds the template text from Expo. Replace the copyright line with your own
before publishing.