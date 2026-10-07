import { COMMAND_TYPES } from "../../constants/commandTypes";
import {
  ACTION_WORDS,
  DEVICE_WORDS,
  MAX_TRANSCRIPT_LENGTH,
  NEGATION_WORDS,
  NON_COMMAND_WORDS,
  QUESTION_STARTERS,
} from "./voiceGrammar";

// PARSER CONTRACT (any replacement, for example an NLP or AI parser, must follow it):
//   parse(transcript: string) =>
//     { ok: true,  command: <COMMAND_TYPES value>, device: <DEVICE_TYPES value> }
//     { ok: false, code: <VOICE_ERROR_CODES value> }
// A parser only decides WHICH command was meant. It never talks to the network,
// and the backend validates every command again.

export const VOICE_ERROR_CODES = Object.freeze({
  EMPTY_TRANSCRIPT: "EMPTY_TRANSCRIPT",
  TOO_LONG: "TOO_LONG",
  NOT_A_COMMAND: "NOT_A_COMMAND",
  NEGATED: "NEGATED",
  NO_DEVICE: "NO_DEVICE",
  NO_ACTION: "NO_ACTION",
  AMBIGUOUS_DEVICE: "AMBIGUOUS_DEVICE",
  AMBIGUOUS_ACTION: "AMBIGUOUS_ACTION",
  UNSUPPORTED_ACTION: "UNSUPPORTED_ACTION",
});

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

// word -> canonical name lookups, built once.
function buildLookup(wordTable) {
  const lookup = new Map();
  Object.entries(wordTable).forEach(([name, words]) => {
    words.forEach((word) => lookup.set(word, name));
  });
  return lookup;
}

const DEVICE_LOOKUP = buildLookup(DEVICE_WORDS);
const ACTION_LOOKUP = buildLookup(ACTION_WORDS);
const NEGATIONS = new Set(NEGATION_WORDS);
const NON_COMMANDS = new Set(NON_COMMAND_WORDS);
const QUESTION_START = new Set(QUESTION_STARTERS);

const fail = (code) => ({ ok: false, code });

// "Turn ON the Light!" -> ["turn", "on", "the", "light"]
// Apostrophes are removed first so "don't" becomes "dont".
function tokenize(transcript) {
  const text = transcript
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    // "shut" alone means close, but "shut off / shut down" means off.
    .replace(/\bshut (off|down)\b/g, "off");

  return text ? text.split(" ") : [];
}

export function parseVoiceCommand(transcript) {
  if (typeof transcript !== "string" || transcript.trim() === "") {
    return fail(VOICE_ERROR_CODES.EMPTY_TRANSCRIPT);
  }
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return fail(VOICE_ERROR_CODES.TOO_LONG);
  }

  const tokens = tokenize(transcript);
  if (tokens.length === 0) {
    return fail(VOICE_ERROR_CODES.EMPTY_TRANSCRIPT);
  }

  if (tokens.some((token) => NEGATIONS.has(token))) {
    return fail(VOICE_ERROR_CODES.NEGATED);
  }
  if (
    QUESTION_START.has(tokens[0]) ||
    tokens.some((token) => NON_COMMANDS.has(token))
  ) {
    return fail(VOICE_ERROR_CODES.NOT_A_COMMAND);
  }

  // Unknown words ("please", "the", "in the kitchen") are simply ignored.
  const devices = new Set();
  const actions = new Set();
  tokens.forEach((token) => {
    if (DEVICE_LOOKUP.has(token)) devices.add(DEVICE_LOOKUP.get(token));
    if (ACTION_LOOKUP.has(token)) actions.add(ACTION_LOOKUP.get(token));
  });

  if (devices.size === 0 && actions.size === 0) {
    return fail(VOICE_ERROR_CODES.NOT_A_COMMAND);
  }
  if (devices.size > 1) return fail(VOICE_ERROR_CODES.AMBIGUOUS_DEVICE);
  if (actions.size > 1) return fail(VOICE_ERROR_CODES.AMBIGUOUS_ACTION);
  if (devices.size === 0) return fail(VOICE_ERROR_CODES.NO_DEVICE);
  if (actions.size === 0) return fail(VOICE_ERROR_CODES.NO_ACTION);

  const [device] = devices;
  const [action] = actions;
  const commandName = `${device.toUpperCase()}_${action}`;

  if (!hasOwn(COMMAND_TYPES, commandName)) {
    return fail(VOICE_ERROR_CODES.UNSUPPORTED_ACTION);
  }

  return { ok: true, command: COMMAND_TYPES[commandName], device };
}