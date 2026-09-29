import {
  COMMAND_DEFINITIONS,
  DEVICE_CONFIG,
} from "../../constants/deviceConfig";
import { DEVICE_TYPE_LIST } from "../../constants/deviceTypes";
import { createApiError } from "../errors";

// In-memory imitation of the Flask API, following docs/api.md.
// The "encrypted" payload is RANDOM BYTES for shape-testing only; it is not real encryption.

const LATENCY_MS = 400;

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const deviceStates = DEVICE_TYPE_LIST.reduce((states, deviceId) => {
  states[deviceId] = DEVICE_CONFIG[deviceId].defaultState;
  return states;
}, {});

function fakeBase64(byteLength) {
  let binary = "";
  for (let i = 0; i < byteLength; i += 1) {
    binary += String.fromCharCode(Math.floor(Math.random() * 256));
  }
  return btoa(binary);
}

function handleCommand(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw createApiError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Request body must be a JSON object.",
    });
  }

  const { device, command } = data;

  if (typeof device !== "string" || typeof command !== "string") {
    throw createApiError({
      status: 400,
      code: "INVALID_REQUEST",
      message: 'Fields "device" and "command" are required strings.',
    });
  }
  if (!DEVICE_TYPE_LIST.includes(device)) {
    throw createApiError({
      status: 400,
      code: "INVALID_DEVICE",
      message: "Unsupported device.",
    });
  }
  if (!hasOwn(COMMAND_DEFINITIONS, command)) {
    throw createApiError({
      status: 400,
      code: "INVALID_COMMAND",
      message: "Unsupported command.",
    });
  }
  if (COMMAND_DEFINITIONS[command].device !== device) {
    throw createApiError({
      status: 400,
      code: "COMMAND_DEVICE_MISMATCH",
      message: "Command is not valid for this device.",
    });
  }

  deviceStates[device] = COMMAND_DEFINITIONS[command].resultState;

  return {
    success: true,
    command_id: `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    device,
    encrypted_payload: {
      algorithm: "AES-256-GCM",
      nonce: fakeBase64(12),
      ciphertext: fakeBase64(48),
      tag: fakeBase64(16),
    },
  };
}

// Same call shape as the real transport: resolves with the response BODY or rejects with an ApiError.
export async function mockRequest({ method, url, data }) {
  await delay(LATENCY_MS);

  switch (`${String(method).toUpperCase()} ${url}`) {
    case "GET /api/health":
      return { status: "ok" };

    case "GET /api/status":
      return {
        success: true,
        devices: DEVICE_TYPE_LIST.reduce((devices, deviceId) => {
          devices[deviceId] = { state: deviceStates[deviceId] };
          return devices;
        }, {}),
      };

    case "POST /api/commands":
      return handleCommand(data);

    default:
      throw createApiError({
        status: 404,
        code: "NOT_FOUND",
        message: "Resource not found.",
      });
  }
}
