// Every failure in the API layer is normalized into one shape:
//   Error { name: 'ApiError', isApiError: true, code, message, status }
// so the rest of the app never has to inspect Axios internals.

export function createApiError({ code, message, status = null }) {
  const error = new Error(message);
  error.name = "ApiError";
  error.isApiError = true;
  error.code = code;
  error.status = status;
  return error;
}

export function normalizeApiError(error) {
  if (error && error.isApiError) return error;

  // The server answered with an error status.
  if (error && error.response) {
    const { status, data } = error.response;
    const body = data && data.error;

    // Contract-conforming error: { success: false, error: { code, message } }
    if (body && typeof body.code === "string") {
      return createApiError({
        code: body.code,
        message: body.message || "",
        status,
      });
    }
    return createApiError({
      code: status >= 500 ? "SERVER_ERROR" : "UNEXPECTED_RESPONSE",
      message: `Request failed with status ${status}.`,
      status,
    });
  }

  // The request was sent but no response arrived.
  if (error && (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")) {
    return createApiError({
      code: "TIMEOUT",
      message: "The request timed out.",
    });
  }
  if (error && error.request) {
    return createApiError({
      code: "NETWORK_ERROR",
      message: "Unable to reach the backend.",
    });
  }

  return createApiError({
    code: "UNKNOWN_ERROR",
    message: "An unknown error occurred.",
  });
}
