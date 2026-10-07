// Lets the API layer report "the server rejected our token" to the rest of the
// app without importing React. AuthContext registers the handler.

let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === "function" ? handler : null;
}

// `sentAuthorization` is the Authorization header value of the request that failed,
// so a late 401 for an OLD token cannot sign out a newer session.
export function notifyUnauthorized(sentAuthorization) {
  if (unauthorizedHandler) unauthorizedHandler(sentAuthorization);
}