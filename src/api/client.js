import axios from "axios";

import config from "../../app/config";
import { normalizeApiError } from "./errors";

const client = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: config.requestTimeoutMs,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Turn every failure into a normalized ApiError.
client.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normalizeApiError(error)),
);

// Not used yet. Authentication (Phase 13 on the backend) will call this after login
// so every request carries "Authorization: Bearer <token>".
export function setAuthToken(token) {
  if (token) {
    client.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete client.defaults.headers.common.Authorization;
  }
}

export default client;
