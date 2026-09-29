import { sendCommand as sendCommandRequest } from "../api/commands";
import { COMMAND_DEFINITIONS } from "../constants/deviceConfig";
import { DEVICE_TYPE_LIST } from "../constants/deviceTypes";

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

function failure(code, message) {
  return { valid: false, error: { code, message } };
}

// Checks a { device, command } payload. This is a convenience check for the UI;
// the backend remains the authority and validates everything again.
export function validateCommand(payload) {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return failure("INVALID_PAYLOAD", "Command must be an object.");
  }

  const { device, command } = payload;

  if (typeof device !== "string" || typeof command !== "string") {
    return failure(
      "MISSING_FIELDS",
      'Both "device" and "command" must be strings.',
    );
  }
  if (!DEVICE_TYPE_LIST.includes(device)) {
    return failure("UNKNOWN_DEVICE", `Unknown device: ${device}`);
  }
  if (!hasOwn(COMMAND_DEFINITIONS, command)) {
    return failure("UNKNOWN_COMMAND", `Unknown command: ${command}`);
  }
  if (COMMAND_DEFINITIONS[command].device !== device) {
    return failure(
      "COMMAND_DEVICE_MISMATCH",
      `Command ${command} does not belong to device ${device}.`,
    );
  }

  return { valid: true, error: null };
}

// Builds a standardized command object from a COMMAND_TYPES value.
// The device is derived from the command unless one is passed explicitly.
// Throws an Error (with a .code) if the command is not valid.
export function createCommand(command, device) {
  const resolvedDevice =
    device ??
    (hasOwn(COMMAND_DEFINITIONS, command)
      ? COMMAND_DEFINITIONS[command].device
      : undefined);

  const payload = { device: resolvedDevice, command };
  const result = validateCommand(payload);

  if (!result.valid) {
    const error = new Error(result.error.message);
    error.code = result.error.code;
    throw error;
  }

  return Object.freeze(payload);
}

// The device state a command produces once it succeeds.
export function getResultingState(command) {
  if (!hasOwn(COMMAND_DEFINITIONS, command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  return COMMAND_DEFINITIONS[command].resultState;
}

// Validates a command, sends it to the backend, and returns the secured result.
// Throws on invalid commands (Error with .code) and on API failures (ApiError).
export async function submitCommand(command) {
  const payload = createCommand(command);
  const result = await sendCommandRequest(payload);

  return {
    command: payload,
    commandId: result.commandId,
    encryptedPayload: result.encryptedPayload,
  };
}
