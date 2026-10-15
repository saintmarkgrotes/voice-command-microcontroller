# Project rules for AI coding tools

This repository is a smart-home control system: a React Native (Expo) app in the repository
root and a Flask API in `backend/`. Read `README.md` and `docs/` first. These rules override any
generic Expo template advice.

## Hard rules

1. **JavaScript only.** Never create `.ts` or `.tsx` files, TypeScript config, types, enums or
   interfaces. Use `.js` / `.jsx`. Do not run or add `tsc`.
2. **Navigation is React Navigation** (`src/navigation/AppNavigator.js`). Do **not** use Expo
   Router and do not create `app/_layout` files or a `src/app/` routes folder. (`app/` holds
   `config.js` and `AppProviders.js` only.)
3. **Style only with NativeWind** `className`. No CSS files, StyleSheet styling, styled-components
   or Emotion. Native-only props that cannot be classes (for example `placeholderTextColor`,
   `ActivityIndicator color`, `RefreshControl` colors) are the only exception; comment them.
4. **No secrets in the app.** The AES key lives only in `backend/.env`. `EXPO_PUBLIC_*` values are
   visible in the bundle. Never store the login token in AsyncStorage; use
   `src/services/tokenStorage.js` (SecureStore).
5. **Never commit `.env` files or print secrets.** Do not read or paste the contents of
   `backend/.env`. Only the `.env.example` templates are committed.
6. **Keep the layers apart.** UI components make no network calls. Screens use hooks, hooks use
   services, services use `src/api/`. Backend routes stay thin; logic lives in `services/`.
7. **The backend is the authority.** Any check added to the app must also exist in the backend.
8. **Do not implement ESP32 firmware** until Phase 19 asks for it.

## Commands

```text
npx expo install <package>      add a dependency (resolves SDK-compatible versions)
npx expo start -c               run the app (clear the cache after .env changes)
npm test                        app unit tests (Jest)
npm run test:e2e                app against a live backend (needs env vars, see README)
npx expo lint                   lint

cd backend
venv\Scripts\Activate.ps1       activate the venv first (macOS/Linux: source venv/bin/activate)
pytest -q                       backend tests
python run.py                   run the API
```

Run the relevant tests and lint before declaring a task done.

## Expo version

Expo changes between SDK releases. Before using an Expo or React Native API you are unsure
about, check the `expo` version in `package.json` and read the matching docs at
`https://docs.expo.dev/versions/v<major>.0.0/` rather than answering from memory. Libraries with
native code do not work in Expo Go unless Expo Go bundles them; use a development build.

## Shared vocabulary

Devices, commands and their resulting states are defined twice and must stay identical:
`src/constants/deviceConfig.js` (app) and `backend/app/constants.py` (backend). If you change one,
change the other, plus `docs/api.md` and the tests.

## When you change behavior

- Update the tests next to the code (`__tests__/` folders, `backend/tests/`).
- Update `docs/api.md` for any endpoint or error change and `docs/security.md` for any security
  change.
- Voice parser changes need new cases in
  `src/services/voice/__tests__/commandParser.test.js`; it must refuse when unsure.