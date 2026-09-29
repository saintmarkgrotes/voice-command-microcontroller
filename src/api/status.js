import { DEVICE_STATES } from "../constants/deviceStates";
import { DEVICE_TYPE_LIST } from "../constants/deviceTypes";
import { createApiError } from "./errors";
import { request } from "./transport";

const VALID_STATES = Object.values(DEVICE_STATES);

// Converts the contract body into a simple { light: 'off', door: 'closed', ... } map.
function parseStatusResponse(body) {
  const devices = body && body.success === true ? body.devices : null;
  const states = {};

  if (devices && typeof devices === "object") {
    DEVICE_TYPE_LIST.forEach((deviceId) => {
      const state = devices[deviceId] && devices[deviceId].state;
      if (VALID_STATES.includes(state)) {
        states[deviceId] = state;
      }
    });
  }

  if (Object.keys(states).length === 0) {
    throw createApiError({
      code: "UNEXPECTED_RESPONSE",
      message: "The backend returned an unexpected status response.",
    });
  }
  return states;
}

// GET /api/status
export async function getStatus() {
  const body = await request({ method: "get", url: "/api/status" });
  return parseStatusResponse(body);
}
