import { DEVICE_TYPES } from "../../constants/deviceTypes";

// Everything the parser knows about spoken language lives in this file.
// Words are compared as WHOLE words, never as substrings ("fan" does not match "fantastic").

// Longer transcripts are rejected: real commands are short.
export const MAX_TRANSCRIPT_LENGTH = 100;

// Spoken words for each device.
export const DEVICE_WORDS = Object.freeze({
  [DEVICE_TYPES.LIGHT]: ["light", "lights", "lamp", "lamps"],
  [DEVICE_TYPES.FAN]: ["fan", "fans"],
  [DEVICE_TYPES.DOOR]: ["door", "doors"],
  [DEVICE_TYPES.PUMP]: ["pump", "pumps"],
});

// Spoken words for each action. The action name is combined with the device
// ("LIGHT" + "_" + "ON") and must exist in COMMAND_TYPES, so a device only
// accepts the actions it really supports ("open the light" is rejected).
export const ACTION_WORDS = Object.freeze({
  ON: ["on", "start", "activate", "enable", "run"],
  OFF: ["off", "stop", "deactivate", "disable"],
  OPEN: ["open"],
  CLOSE: ["close", "shut"],
});

// Any of these anywhere means the person did NOT ask us to act, so nothing is sent.
// Refusing is the safe direction for a door or a pump.
export const NEGATION_WORDS = Object.freeze([
  "not",
  "no",
  "nope",
  "dont",
  "doesnt",
  "wont",
  "cant",
  "cannot",
  "never",
  "cancel",
  "without",
]);

// Conditionals and hypotheticals are not commands ("open the door when I say").
export const NON_COMMAND_WORDS = Object.freeze([
  "if",
  "whether",
  "when",
  "while",
  "unless",
]);

// A transcript that STARTS with one of these is a question ("is the light on").
export const QUESTION_STARTERS = Object.freeze([
  "is",
  "are",
  "was",
  "what",
  "whats",
  "why",
  "how",
  "where",
  "which",
  "who",
  "does",
  "did",
]);