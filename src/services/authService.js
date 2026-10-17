import { login } from "../api/auth";

// Keep API/session transport details out of the React provider.
export { setAuthToken } from "../api/client";
export { setUnauthorizedHandler } from "../api/session";

export async function authenticate(username, password) {
  const result = await login(username, password);
  return {
    accessToken: result.accessToken,
    expiresAt: Date.now() + result.expiresIn * 1000,
    user: result.user,
  };
}
