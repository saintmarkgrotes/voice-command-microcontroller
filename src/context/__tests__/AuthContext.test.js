import { act, renderHook, waitFor } from "@testing-library/react-native";

import config from "../../../app/config";
import { login } from "../../api/auth";
import { setAuthToken } from "../../api/client";
import { notifyUnauthorized } from "../../api/session";
import { AuthProvider, useAuth } from "../AuthContext";

jest.mock("../../../app/config", () => ({
  __esModule: true,
  default: { apiBaseUrl: "http://test", requestTimeoutMs: 1000, useMockApi: false },
}));
jest.mock("../../api/auth", () => ({ login: jest.fn() }));
jest.mock("../../api/client", () => ({ __esModule: true, default: {}, setAuthToken: jest.fn() }));

// In-memory stand-in for the device keychain. The "mock" prefix lets jest.mock use it.
const mockStore = new Map();

jest.mock("expo-secure-store", () => ({
  isAvailableAsync: jest.fn(async () => true),
  getItemAsync: jest.fn(async (key) => (mockStore.has(key) ? mockStore.get(key) : null)),
  setItemAsync: jest.fn(async (key, value) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key) => {
    mockStore.delete(key);
  }),
}));

const KEY = "smart_home.session";
const ADMIN = { username: "admin", role: "admin" };
const VIEWER = { username: "viewer", role: "viewer" };

const loginResult = (token, user = ADMIN) => ({ accessToken: token, expiresIn: 3600, user });
const savedSession = (overrides = {}) => ({
  accessToken: "restored-token",
  expiresAt: Date.now() + 600_000,
  user: ADMIN,
  ...overrides,
});

async function mount() {
  const hook = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(hook.result.current.status).not.toBe("loading"));
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  config.useMockApi = false;
});

describe("starting the app", () => {
  test("no saved session -> signed out", async () => {
    const { result } = await mount();
    expect(result.current).toMatchObject({ status: "signedOut", user: null, notice: null });
    expect(setAuthToken).not.toHaveBeenCalledWith(expect.any(String));
  });

  test("a valid saved session is restored", async () => {
    mockStore.set(KEY, JSON.stringify(savedSession()));
    const { result } = await mount();
    expect(result.current).toMatchObject({ status: "signedIn", user: ADMIN, canControl: true });
    expect(setAuthToken).toHaveBeenCalledWith("restored-token");
  });

  test("an expired saved session is dropped with a notice", async () => {
    mockStore.set(KEY, JSON.stringify(savedSession({ expiresAt: Date.now() - 1000 })));
    const { result } = await mount();
    expect(result.current.status).toBe("signedOut");
    expect(result.current.notice).toMatch(/expired/i);
    expect(mockStore.has(KEY)).toBe(false);
    expect(setAuthToken).not.toHaveBeenCalledWith(expect.any(String));
  });

  test.each(["{broken", "null", JSON.stringify({ accessToken: "x" })])(
    "corrupt saved data (%s) is ignored and deleted",
    async (raw) => {
      mockStore.set(KEY, raw);
      const { result } = await mount();
      expect(result.current.status).toBe("signedOut");
      expect(mockStore.has(KEY)).toBe(false);
    },
  );

  test("mock mode: signed in immediately, nothing to sign in to", async () => {
    config.useMockApi = true;
    const { result } = await renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current).toMatchObject({
      status: "signedIn",
      isMockMode: true,
      canControl: true,
      user: { username: "mock-user", role: "admin" },
    });
    await act(() => result.current.signOut());
    expect(result.current.status).toBe("signedIn");
    expect(login).not.toHaveBeenCalled();
  });
});

describe("signing in and out", () => {
  test("a good login starts and saves a session", async () => {
    login.mockResolvedValue(loginResult("tok-1"));
    const { result } = await mount();

    await act(() => result.current.signIn("admin", "pw-123"));

    expect(login).toHaveBeenCalledWith("admin", "pw-123");
    expect(result.current).toMatchObject({ status: "signedIn", user: ADMIN, canControl: true });
    expect(setAuthToken).toHaveBeenCalledWith("tok-1");

    const stored = JSON.parse(mockStore.get(KEY));
    expect(stored.accessToken).toBe("tok-1");
    expect(stored.user).toEqual(ADMIN);
    expect(Math.abs(stored.expiresAt - (Date.now() + 3600_000))).toBeLessThan(5000);
    expect(mockStore.get(KEY)).not.toContain("pw-123"); // password is never stored
  });

  test("a viewer cannot control devices", async () => {
    login.mockResolvedValue(loginResult("tok-v", VIEWER));
    const { result } = await mount();
    await act(() => result.current.signIn("viewer", "pw"));
    expect(result.current).toMatchObject({ status: "signedIn", canControl: false });
  });

  test("wrong credentials: the error reaches the caller and nothing changes", async () => {
    login.mockRejectedValue(Object.assign(new Error("x"), { code: "INVALID_CREDENTIALS" }));
    const { result } = await mount();

    let caught;
    await act(async () => {
      try {
        await result.current.signIn("admin", "wrong");
      } catch (error) {
        caught = error;
      }
    });

    expect(caught.code).toBe("INVALID_CREDENTIALS");
    expect(result.current.status).toBe("signedOut");
    expect(mockStore.has(KEY)).toBe(false);
    expect(setAuthToken).not.toHaveBeenCalledWith(expect.any(String));
  });

  test("sign out clears the token, storage and state", async () => {
    login.mockResolvedValue(loginResult("tok-1"));
    const { result } = await mount();
    await act(() => result.current.signIn("admin", "pw"));

    await act(() => result.current.signOut());

    expect(result.current).toMatchObject({ status: "signedOut", user: null, notice: null });
    expect(setAuthToken).toHaveBeenLastCalledWith(null);
    expect(mockStore.has(KEY)).toBe(false);
  });
});

describe("the server ends the session (401)", () => {
  async function signedIn(token = "tok-1") {
    login.mockResolvedValueOnce(loginResult(token));
    const hook = await mount();
    await act(() => hook.result.current.signIn("admin", "pw"));
    return hook;
  }

  test("a 401 for the current token returns to login with a notice", async () => {
    const { result } = await signedIn("tok-1");

    await act(async () => notifyUnauthorized("Bearer tok-1"));
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    expect(result.current.notice).toMatch(/expired/i);
    expect(mockStore.has(KEY)).toBe(false);
    expect(setAuthToken).toHaveBeenLastCalledWith(null);
  });

  test("a late 401 for an OLD token does not end the NEW session", async () => {
    const { result } = await signedIn("token-A");
    await act(() => result.current.signOut());
    login.mockResolvedValueOnce(loginResult("token-B"));
    await act(() => result.current.signIn("admin", "pw"));

    await act(async () => notifyUnauthorized("Bearer token-A"));

    expect(result.current.status).toBe("signedIn");
    expect(JSON.parse(mockStore.get(KEY)).accessToken).toBe("token-B");
  });

  test("a 401 without a token (or while signed out) is ignored", async () => {
    const { result } = await signedIn("tok-1");
    await act(async () => notifyUnauthorized(undefined));
    expect(result.current.status).toBe("signedIn");

    await act(() => result.current.signOut());
    await act(async () => notifyUnauthorized("Bearer tok-1"));
    expect(result.current).toMatchObject({ status: "signedOut", notice: null });
  });
});

test("useAuth outside the provider is an error", async () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  await expect(renderHook(() => useAuth())).rejects.toThrow("useAuth must be used inside");
  spy.mockRestore();
});