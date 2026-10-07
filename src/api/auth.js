import { createApiError } from "./errors";
import { request } from "./transport";

const ROLES = ["admin", "viewer"];

// Confirms the backend returned a real login result before the app trusts it.
function parseLoginResponse(body) {
  const user = body && body.user;

  const valid =
    body &&
    body.success === true &&
    typeof body.access_token === "string" &&
    body.access_token.length > 0 &&
    body.token_type === "Bearer" &&
    Number.isFinite(body.expires_in) &&
    body.expires_in > 0 &&
    user &&
    typeof user.username === "string" &&
    ROLES.includes(user.role);

  if (!valid) {
    throw createApiError({
      code: "UNEXPECTED_RESPONSE",
      message: "The backend returned an unexpected login response.",
    });
  }

  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in,
    user: { username: user.username, role: user.role },
  };
}

// POST /api/auth/login   body: { username, password }
export async function login(username, password) {
  const body = await request({
    method: "post",
    url: "/api/auth/login",
    data: { username, password },
  });
  return parseLoginResponse(body);
}