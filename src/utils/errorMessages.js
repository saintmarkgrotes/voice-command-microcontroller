// Maps error codes to user-friendly text. Raw server messages and technical
// details are never shown. Phase 15 will refine the wording and presentation.

const FALLBACK = "⚠️ Something went wrong. Please try again.";
const NOT_SUPPORTED = "⚠️ That command is not supported.";

const MESSAGES = {
  NETWORK_ERROR:
    "⚠️ Unable to connect to the backend.\n\nPlease check your network connection.",
  TIMEOUT: "⚠️ The backend took too long to respond. Please try again.",
  UNAUTHORIZED: "⚠️ You are not signed in, or your session has expired.",
  INVALID_CREDENTIALS: "⚠️ Incorrect username or password.",
  FORBIDDEN: "⚠️ You do not have permission to do that.",
  NOT_FOUND: "⚠️ The requested resource was not found.",
  CONFLICT:
    "⚠️ That action conflicts with the current state. Please refresh and try again.",
  RATE_LIMITED: "⚠️ Too many requests. Please wait a moment and try again.",
  INTERNAL_ERROR: "⚠️ The backend had a problem. Please try again later.",
  SERVER_ERROR: "⚠️ The backend had a problem. Please try again later.",
  SERVICE_UNAVAILABLE: "⚠️ The backend is temporarily unavailable.",
  UNEXPECTED_RESPONSE:
    "⚠️ The backend sent a response the app could not understand.",

  // Command validation failures (frontend and backend)
  INVALID_REQUEST: NOT_SUPPORTED,
  INVALID_COMMAND: NOT_SUPPORTED,
  INVALID_DEVICE: NOT_SUPPORTED,
  COMMAND_DEVICE_MISMATCH: NOT_SUPPORTED,
  INVALID_PAYLOAD: NOT_SUPPORTED,
  MISSING_FIELDS: NOT_SUPPORTED,
  UNKNOWN_COMMAND: NOT_SUPPORTED,
  UNKNOWN_DEVICE: NOT_SUPPORTED,
};

export function getUserMessage(error) {
  const code = error && error.code;
  return (code && MESSAGES[code]) || FALLBACK;
}