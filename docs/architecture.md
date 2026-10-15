# Architecture

## 1. What this project is

A smart-home control system. A React Native phone app sends commands (by button or by
voice) to a Flask backend. The backend checks who is asking, validates the command and
encrypts it with AES-256-GCM, ready for an ESP32 microcontroller to receive.

**Built now:** the mobile app, the backend API, authentication, encryption, simulated device
state, a voice-command parser (with a typed "mock voice" input), tests and documentation.

**Not built yet:** the ESP32 firmware and real hardware. The backend stops at the encrypted
command, and the API and payload are designed so the ESP32 can be added without redesigning
anything (see [Extending to the ESP32](#8-extending-to-the-esp32)).

## 2. The whole system

```text
                    USER
                      │
              taps a button, or speaks
                      │
                      ▼
        ┌──────────────────────────────┐
        │   React Native app (Expo)    │   JavaScript, NativeWind, React Navigation
        │   login • dashboard • voice  │
        └──────────────┬───────────────┘
                       │  HTTP + JSON  (Authorization: Bearer token)
                       ▼
        ┌──────────────────────────────┐
        │   Flask REST API (Python)    │
        │                              │
        │   Authenticate  → who?       │
        │   Authorize     → allowed?   │
        │   Rate limit    → too many?  │
        │   Validate      → valid?     │
        │   Command service            │
        │   AES-256-GCM encrypt        │
        └──────────────┬───────────────┘
                       │  encrypted payload
                       ▼
                  (future) ESP32 → decrypt → verify → hardware
```

The app never sees the AES key. It receives the encrypted payload only as proof that the
backend processed the command.

## 3. Mobile app (repository root)

The Expo app lives at the repository root.

```text
App.js, index.js            Entry points (providers + navigation)
app/
  config.js                 Settings from EXPO_PUBLIC_* variables (backend URL, mock mode, timeout)
  AppProviders.js           Safe-area, status bar and AuthProvider
src/
  api/                      Talking to the backend; no UI code
    client.js               Axios instance, Bearer token, error normalization, 401 detection
    transport.js            Chooses the real backend or the built-in mock
    auth.js, commands.js, status.js, health.js   One function per endpoint, with response checks
    errors.js               Turns every failure into an ApiError with a stable code
    session.js              Lets the API layer tell the app "the token was rejected"
    mock/mockBackend.js     Fake backend so the app runs without a server
  constants/                DEVICE_TYPES, COMMAND_TYPES, DEVICE_STATES, device configuration
  context/AuthContext.js    Who is signed in; sign in, sign out, restore, end on 401
  hooks/
    useDevices.js           Device states, sending commands, refresh, offline detection
    useVoiceCommand.js      Transcript to parser to command flow
  services/
    commandService.js       Builds and validates commands, sends them
    tokenStorage.js         Saves the session in SecureStore (memory fallback)
    voice/                  voiceGrammar.js (words) and commandParser.js (decisions)
  components/               Reusable NativeWind UI pieces (no API calls)
  screens/                  HomeScreen, LoginScreen, SessionLoadingScreen
  navigation/AppNavigator.js  Shows Loading, Login or Home depending on sign-in state
  utils/                    Friendly error messages and voice messages
e2e/                        Test that runs the app's API layer against a live backend
```

Rules the code follows:

- JavaScript only, no TypeScript. Styling only through NativeWind `className`.
- UI components never call the network. Screens use hooks, hooks use services, services use
  the API layer.
- One command flow: a button press and a recognized phrase both end in
  `sendCommand(COMMAND_TYPES value)`.
- Mock mode (`EXPO_PUBLIC_USE_MOCK_API` not `"false"`) skips login and uses a fake backend.

## 4. Backend (`backend/`)

```text
run.py                      Starts the server
app/
  __init__.py               App factory: checks secrets, wires services, registers routes
  config.py                 Settings from environment variables (.env)
  constants.py              Devices, commands and their resulting states (mirrors the app)
  errors.py                 One JSON error format for every failure
  routes/                   HTTP only: parse the request, call a service, build the response
    health.py, auth.py, commands.py, status.py
  security/
    authentication.py       Users, password check, token issue and verify, roles, require_auth
    rate_limit.py           In-memory sliding-window limiter
  services/                 Business logic, no Flask objects
    command_service.py      Adds id and timestamp, encrypts, updates state
    encryption_service.py   AES-256-GCM encrypt and decrypt
    device_state_service.py Simulated device state (thread-safe)
  utils/validators.py       Input validation and normalization
scripts/                    generate_key.py, create_user.py, decrypt_payload.py
tests/                      pytest suite
```

Rules the code follows: routes stay thin; secrets come only from the environment; the app
refuses to start with missing or weak secrets; every failure goes through `errors.py`.

## 5. Main flows

**Sign in**

```text
LoginScreen → AuthContext.signIn → POST /api/auth/login
   backend: validate body → check lockout → check password hash → issue token
   app: store token in SecureStore → set Authorization header → show Home
```

**Tap LIGHT ON**

```text
DeviceCard button → useDevices.sendCommand("LIGHT_ON") → commandService.submitCommand
  → POST /api/commands  { device, command }  + Bearer token
  backend: authenticate → require admin → rate limit → validate → add id + timestamp
           → encrypt (AES-256-GCM) → update simulated state → respond
  app: checks the payload shape → updates the card → shows "Command secured"
```

**Say "turn on the light"** (typed in mock voice mode)

```text
MockVoiceInput → useVoiceCommand.submitTranscript → parseVoiceCommand → "LIGHT_ON"
  → the same flow as a button press.  Unclear or risky phrases send nothing.
```

**Refresh**

```text
Pull-to-refresh, app returns to foreground, or first load → GET /api/status
  A refresh that started before a command and finishes after it is ignored,
  so it cannot undo the command.
```

**Session ends**

```text
Any request returns 401 UNAUTHORIZED while a token was sent
  → API layer notifies AuthContext → token and saved session cleared → Login screen
```

## 6. Key decisions

| Decision | Why |
| -------- | --- |
| The backend encrypts, the app never has the key | A key inside an app can be extracted |
| AES-256-GCM, fresh random nonce per message | Confidentiality plus tamper detection, standard and well tested |
| Signed login tokens with two roles | Real access control without a database; viewers can watch but not control |
| Checks happen in a fixed order | A refused request never changes anything |
| The server creates the id and timestamp | Clients cannot choose them; a receiver can reject replays |
| The voice parser refuses when unsure | Acting on a wrong guess about a door or pump is worse than doing nothing |
| The parser sits behind a small contract | An AI or NLP parser can replace it without touching the rest |
| Mock backend and mock voice input | The app can be developed and demonstrated without a server or microphone |
| The app and backend both validate | The app's checks are convenience, the backend's are the authority |
| Device state is simulated in memory | Lets the whole app behave realistically before the ESP32 exists |

## 7. Testing strategy

| Layer | Tool | Command | What it covers |
| ----- | ---- | ------- | -------------- |
| Backend | pytest | `cd backend` then `pytest -q` | Endpoints, validation, encryption, auth, rate limits, end-to-end flow with an independent decryptor |
| App | Jest + Testing Library | `npm test` | Voice parser, command model, API response checks, session, hooks, components |
| App with real backend | Jest | `npm run test:e2e` | The app's API layer against a running backend |
| Manual | Phone | see the README | The full path on a real device |

## 8. Extending to the ESP32

What is ready:

- The encrypted payload format, including the context string, is fixed and documented in
  [api.md](api.md) and [security.md](security.md).
- Every payload carries a `command_id` and a server `timestamp` so the receiver can reject
  duplicates and old commands.
- The backend's device state is a clean seam: a future `DeviceStateService` can read real
  device state instead of simulating it.

What is still to decide (Phase 19):

- How the encrypted payload reaches the ESP32 (for example MQTT or HTTP) and how the ESP32
  reports state back.
- How the shared key is provisioned to the device, and how replay protection is kept on a
  device with limited memory and no reliable clock.
- The ESP32 decryption steps, written out for firmware developers.