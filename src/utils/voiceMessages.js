import { VOICE_ERROR_CODES } from "../services/voice/commandParser";

// User-facing text for voice parsing failures. These are not API errors,
// so they are kept apart from errorMessages.js.

const FALLBACK = "⚠️ I couldn't understand that. Please try again.";

const MESSAGES = {
  [VOICE_ERROR_CODES.EMPTY_TRANSCRIPT]:
    "⚠️ I didn't catch that. Please try again.",
  [VOICE_ERROR_CODES.TOO_LONG]:
    '⚠️ That was too long. Try a short command like "turn on the light".',
  [VOICE_ERROR_CODES.NOT_A_COMMAND]:
    "⚠️ That doesn't sound like a device command.",
  [VOICE_ERROR_CODES.NEGATED]: "⚠️ Understood as a cancel. Nothing was sent.",
  [VOICE_ERROR_CODES.NO_DEVICE]:
    "⚠️ Which device? Try light, fan, door or water pump.",
  [VOICE_ERROR_CODES.NO_ACTION]:
    '⚠️ What should I do? Try "on", "off", "open" or "close".',
  [VOICE_ERROR_CODES.AMBIGUOUS_DEVICE]:
    "⚠️ One device at a time, please. Nothing was sent.",
  [VOICE_ERROR_CODES.AMBIGUOUS_ACTION]:
    "⚠️ I heard conflicting actions. Nothing was sent.",
  [VOICE_ERROR_CODES.UNSUPPORTED_ACTION]:
    "⚠️ That device doesn't support that action.",
};

export function getVoiceMessage(code) {
  return (code && MESSAGES[code]) || FALLBACK;
}