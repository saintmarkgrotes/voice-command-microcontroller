import * as SecureStore from "expo-secure-store";

// The login token is stored with expo-secure-store (Keychain on iOS, Keystore on
// Android). Never use AsyncStorage for it: AsyncStorage is plain text.
//
// Where SecureStore does not exist (for example Expo web), the session is kept
// in memory only: it works, but is lost on reload. The token is never written
// to browser storage.

const STORAGE_KEY = "smart_home.session";
const ROLES = ["admin", "viewer"];
const EXPIRY_MARGIN_MS = 30 * 1000; // treat nearly expired tokens as expired

let memorySession = null;

async function isSecureStoreAvailable() {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

// { accessToken, expiresAt (ms since epoch), user: { username, role } }
function isValidSession(session) {
  return Boolean(
    session &&
      typeof session.accessToken === "string" &&
      session.accessToken.length > 0 &&
      Number.isFinite(session.expiresAt) &&
      session.user &&
      typeof session.user.username === "string" &&
      ROLES.includes(session.user.role),
  );
}

export function isSessionExpired(session, now = Date.now()) {
  return session.expiresAt - EXPIRY_MARGIN_MS <= now;
}

export async function saveSession(session) {
  memorySession = session;
  if (!(await isSecureStoreAvailable())) return;
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Keep the in-memory copy: the user stays signed in until the app closes.
  }
}

// Returns a valid saved session or null. Corrupt data is deleted.
export async function loadSession() {
  if (!(await isSecureStoreAvailable())) {
    return isValidSession(memorySession) ? memorySession : null;
  }

  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (isValidSession(session)) return session;
  } catch {
    // fall through to cleanup
  }
  await clearSession();
  return null;
}

export async function clearSession() {
  memorySession = null;
  if (!(await isSecureStoreAvailable())) return;
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // Nothing more we can do; the in-memory copy is already gone.
  }
}