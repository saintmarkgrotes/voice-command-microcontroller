import { VOICE_ERROR_CODES } from "../../services/voice/commandParser";
import { getUserMessage } from "../errorMessages";
import { getVoiceMessage } from "../voiceMessages";

const FALLBACK = getUserMessage({ code: "SOME_CODE_NOBODY_KNOWS" });

describe("API error messages", () => {
  // every code the backend (docs/api.md) or the app itself can produce
  test.each([
    "NETWORK_ERROR",
    "TIMEOUT",
    "UNAUTHORIZED",
    "INVALID_CREDENTIALS",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "RATE_LIMITED",
    "INTERNAL_ERROR",
    "SERVER_ERROR",
    "SERVICE_UNAVAILABLE",
    "UNEXPECTED_RESPONSE",
    "INVALID_REQUEST",
    "INVALID_COMMAND",
    "INVALID_DEVICE",
    "COMMAND_DEVICE_MISMATCH",
    "UNKNOWN_COMMAND",
    "UNKNOWN_DEVICE",
    "MISSING_FIELDS",
    "INVALID_PAYLOAD",
  ])("%s has its own friendly message", (code) => {
    const message = getUserMessage({ code });
    expect(message).not.toBe(FALLBACK);
    expect(message.startsWith("⚠️")).toBe(true);
  });

  test("the network message is the one from the spec", () => {
    expect(getUserMessage({ code: "NETWORK_ERROR" })).toContain("Unable to connect to the backend.");
    expect(getUserMessage({ code: "NETWORK_ERROR" })).toContain("Please check your network connection.");
  });

  test("unknown codes and bad input use the safe fallback", () => {
    [{ code: "WHATEVER" }, {}, null, undefined, { code: 5 }].forEach((error) => {
      expect(getUserMessage(error)).toBe(FALLBACK);
    });
  });

  test("raw server text and stack traces are never shown", () => {
    const hostile = {
      code: "INTERNAL_ERROR",
      message: "Traceback (most recent call last): secret db password",
      stack: "at secret.js:1",
    };
    const text = getUserMessage(hostile);
    expect(text).not.toContain("Traceback");
    expect(text).not.toContain("secret");
  });
});

describe("voice messages", () => {
  const voiceFallback = getVoiceMessage("NOT_A_REAL_CODE");

  test.each(Object.values(VOICE_ERROR_CODES))("%s has its own message", (code) => {
    const message = getVoiceMessage(code);
    expect(message).not.toBe(voiceFallback);
    expect(message.startsWith("⚠️")).toBe(true);
  });

  test("unknown or missing codes use the fallback", () => {
    expect(getVoiceMessage(undefined)).toBe(voiceFallback);
    expect(getVoiceMessage(null)).toBe(voiceFallback);
  });
});