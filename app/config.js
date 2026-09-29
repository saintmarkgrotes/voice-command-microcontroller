// Runtime configuration. Values come from EXPO_PUBLIC_* environment variables,
// which Expo inlines at build time. They are visible inside the app bundle,
// so NEVER put secrets here (the AES key lives only on the backend).
//
// Note: each variable must be referenced literally (process.env.EXPO_PUBLIC_X)
// for Expo to inline it.

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";

const config = Object.freeze({
  apiBaseUrl: rawApiUrl.replace(/\/+$/, ""), // strip trailing slashes
  // Mock mode is ON unless explicitly set to "false", so the app runs without a backend.
  useMockApi: process.env.EXPO_PUBLIC_USE_MOCK_API !== "false",
  requestTimeoutMs: 8000,
});

export default config;
