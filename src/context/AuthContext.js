import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import config from "../../app/config";
import { login as loginRequest } from "../api/auth";
import { setAuthToken } from "../api/client";
import { setUnauthorizedHandler } from "../api/session";
import {
  clearSession,
  isSessionExpired,
  loadSession,
  saveSession,
} from "../services/tokenStorage";

const SESSION_EXPIRED_NOTICE = "Your session expired. Please sign in again.";

// Mock mode has no backend, so there is nothing to sign in to.
const MOCK_USER = Object.freeze({ username: "mock-user", role: "admin" });

const AuthContext = createContext(null);

// status: 'loading' (reading the saved session) | 'signedOut' | 'signedIn'
function initialState() {
  return config.useMockApi
    ? { status: "signedIn", user: MOCK_USER, notice: null }
    : { status: "loading", user: null, notice: null };
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(initialState);
  const authRef = useRef(auth);
  const tokenRef = useRef(null);

  const update = useCallback((next) => {
    authRef.current = next;
    setAuth(next);
  }, []);

  const startSession = useCallback(
    (session) => {
      tokenRef.current = session.accessToken;
      setAuthToken(session.accessToken);
      update({ status: "signedIn", user: session.user, notice: null });
    },
    [update],
  );

  const signOut = useCallback(
    async (notice = null) => {
      if (config.useMockApi) return;
      tokenRef.current = null;
      setAuthToken(null);
      update({ status: "signedOut", user: null, notice });
      await clearSession();
    },
    [update],
  );

  // Restore a saved session when the app starts.
  useEffect(() => {
    if (config.useMockApi) return undefined;
    let cancelled = false;

    (async () => {
      const session = await loadSession();
      if (cancelled) return;

      if (session && !isSessionExpired(session)) {
        startSession(session);
        return;
      }
      if (session) await clearSession();
      update({
        status: "signedOut",
        user: null,
        notice: session ? SESSION_EXPIRED_NOTICE : null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [startSession, update]);

  // The server rejected our token: go back to the login screen.
  useEffect(() => {
    if (config.useMockApi) return undefined;

    setUnauthorizedHandler((sentAuthorization) => {
      const isCurrentSession =
        authRef.current.status === "signedIn" &&
        tokenRef.current &&
        sentAuthorization === `Bearer ${tokenRef.current}`;
      // A late 401 for an older token must not end a newer session.
      if (isCurrentSession) signOut(SESSION_EXPIRED_NOTICE);
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  // Throws an ApiError (INVALID_CREDENTIALS, RATE_LIMITED, NETWORK_ERROR, ...) on failure.
  const signIn = useCallback(
    async (username, password) => {
      const result = await loginRequest(username, password);
      const session = {
        accessToken: result.accessToken,
        expiresAt: Date.now() + result.expiresIn * 1000,
        user: result.user,
      };
      startSession(session);
      await saveSession(session);
    },
    [startSession],
  );

  const value = useMemo(
    () => ({
      status: auth.status,
      user: auth.user,
      notice: auth.notice,
      isMockMode: config.useMockApi,
      // Viewers may read status but the backend rejects their commands (403).
      canControl: Boolean(auth.user) && auth.user.role === "admin",
      signIn,
      signOut,
    }),
    [auth, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return context;
}