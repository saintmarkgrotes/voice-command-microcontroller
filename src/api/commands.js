import { createApiError } from "./errors";
import { request } from "./transport";

const isNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0;

// Confirms the backend returned a real encrypted payload, not something else.
function parseCommandResponse(body) {
  const payload = body && body.encrypted_payload;

  const valid =
    body &&
    body.success === true &&
    isNonEmptyString(body.command_id) &&
    payload &&
    payload.algorithm === "AES-256-GCM" &&
    isNonEmptyString(payload.nonce) &&
    isNonEmptyString(payload.ciphertext) &&
    isNonEmptyString(payload.tag);

  if (!valid) {
    throw createApiError({
      code: "UNEXPECTED_RESPONSE",
      message: "The backend returned an unexpected response.",
    });
  }

  return {
    commandId: body.command_id,
    device: body.device,
    encryptedPayload: {
      algorithm: payload.algorithm,
      nonce: payload.nonce,
      ciphertext: payload.ciphertext,
      tag: payload.tag,
    },
  };
}

// POST /api/commands   body: { device, command }
export async function sendCommand(payload) {
  const body = await request({
    method: "post",
    url: "/api/commands",
    data: payload,
  });
  return parseCommandResponse(body);
}
