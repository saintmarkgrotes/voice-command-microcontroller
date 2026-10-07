import axios from "axios";

import config from "../../app/config";
import { normalizeApiError } from "./errors";
import { notifyUnauthorized } from "./session";

const client = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: config.requestTimeoutMs,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Which Authorization header did the failed request actually carry?
function getSentAuthorization(error) {
  const headers = error && error.config && error.config.headers;
  if (!headers) return undefined;
  return typeof headers.get === "function"
    ? headers.get("Authorization")
    : headers.Authorization;
}

// Turn every failure into a normalized ApiError. A 401 UNAUTHORIZED on a request
// that carried a token means the session ended (expired or revoked), so the app
// is told to return to the login screen. Wrong login credentials use a
// different code (INVALID_CREDENTIALS), so they never trigger this.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = normalizeApiError(error);
    if (apiError.code === "UNAUTHORIZED") {
      notifyUnauthorized(getSentAuthorization(error));
    }
    return Promise.reject(apiError);
  },
);

// Called by AuthContext after login (and on app start with a saved session)
// so every request carries "Authorization: Bearer <token>".
export function setAuthToken(token) {
  if (token) {
    client.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete client.defaults.headers.common.Authorization;
  }
}

export default client;