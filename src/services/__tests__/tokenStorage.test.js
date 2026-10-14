import * as SecureStore from "expo-secure-store";

import {
  clearSession,
  isSessionExpired,
  loadSession,
  saveSession,
} from "../tokenStorage";

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
const session = (overrides = {}) => ({
  accessToken: "token-123",
  expiresAt: Date.now() + 3600 * 1000,
  user: { username: "admin", role: "admin" },
  ...overrides,
});

beforeEach(async () => {
  jest.clearAllMocks();
  SecureStore.isAvailableAsync.mockImplementation(async () => true);
  await clearSession();
  mockStore.clear();
});

describe("saving and loading", () => {
  test("round trip through secure storage", async () => {
    const saved = session();
    await saveSession(saved);

    expect(JSON.parse(mockStore.get(KEY))).toEqual(saved);
    expect(await loadSession()).toEqual(saved);
  });

  test("nothing saved -> null", async () => {
    expect(await loadSession()).toBeNull();
  });

  test("clearSession removes the stored session", async () => {
    await saveSession(session());
    await clearSession();
    expect(mockStore.has(KEY)).toBe(false);
    expect(await loadSession()).toBeNull();
  });

  test("a failing write does not throw", async () => {
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error("keychain locked"));
    await expect(saveSession(session())).resolves.toBeUndefined();
  });

  test("a failing read is treated as no session", async () => {
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error("keychain locked"));
    expect(await loadSession()).toBeNull();
  });
});

describe("tampered or corrupt data is ignored AND deleted", () => {
  test.each([
    ["not JSON", "{broken"],
    ["null", "null"],
    ["an array", "[]"],
    ["missing token", JSON.stringify({ expiresAt: Date.now() + 9e6, user: { username: "a", role: "admin" } })],
    ["empty token", JSON.stringify(session({ accessToken: "" }))],
    ["text expiry", JSON.stringify(session({ expiresAt: "tomorrow" }))],
    ["unknown role", JSON.stringify(session({ user: { username: "a", role: "root" } }))],
    ["no user", JSON.stringify(session({ user: null }))],
  ])("%s", async (_name, raw) => {
    mockStore.set(KEY, raw);
    expect(await loadSession()).toBeNull();
    expect(mockStore.has(KEY)).toBe(false);
  });
});

describe("without SecureStore (for example Expo web)", () => {
  beforeEach(() => SecureStore.isAvailableAsync.mockImplementation(async () => false));

  test("the session lives in memory only and is never written anywhere", async () => {
    const saved = session();
    await saveSession(saved);

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(await loadSession()).toEqual(saved);

    await clearSession();
    expect(await loadSession()).toBeNull();
  });

  test("a SecureStore check that throws counts as unavailable", async () => {
    SecureStore.isAvailableAsync.mockImplementation(async () => {
      throw new Error("not supported");
    });
    await expect(saveSession(session())).resolves.toBeUndefined();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

describe("isSessionExpired", () => {
  const now = 1_000_000_000_000;

  test("far in the future -> not expired", () => {
    expect(isSessionExpired({ expiresAt: now + 3600_000 }, now)).toBe(false);
  });

  test("in the past -> expired", () => {
    expect(isSessionExpired({ expiresAt: now - 1 }, now)).toBe(true);
  });

  test("within 30 seconds of expiry counts as expired", () => {
    expect(isSessionExpired({ expiresAt: now + 29_000 }, now)).toBe(true);
    expect(isSessionExpired({ expiresAt: now + 31_000 }, now)).toBe(false);
  });
});