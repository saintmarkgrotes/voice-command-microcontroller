import { login } from "../auth";
import { sendCommand } from "../commands";
import { getHealth } from "../health";
import { getStatus } from "../status";
import { request } from "../transport";

jest.mock("../transport", () => ({ request: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

const validPayload = {
  algorithm: "AES-256-GCM",
  nonce: "bm9uY2U=",
  ciphertext: "Y2lwaGVy",
  tag: "dGFn",
};
const validCommandBody = {
  success: true,
  command_id: "id-1",
  device: "light",
  encrypted_payload: validPayload,
};

describe("POST /api/commands response", () => {
  test("a valid response is converted for the app", async () => {
    request.mockResolvedValue(validCommandBody);
    const result = await sendCommand({ device: "light", command: "LIGHT_ON" });

    expect(request).toHaveBeenCalledWith({
      method: "post",
      url: "/api/commands",
      data: { device: "light", command: "LIGHT_ON" },
    });
    expect(result).toEqual({
      commandId: "id-1",
      device: "light",
      encryptedPayload: validPayload,
    });
  });

  test.each([
    ["null body", null],
    ["success false", { ...validCommandBody, success: false }],
    ["no command_id", { ...validCommandBody, command_id: "" }],
    ["no payload", { ...validCommandBody, encrypted_payload: undefined }],
    ["wrong algorithm", { ...validCommandBody, encrypted_payload: { ...validPayload, algorithm: "AES-128-CBC" } }],
    ["no nonce", { ...validCommandBody, encrypted_payload: { ...validPayload, nonce: "" } }],
    ["no ciphertext", { ...validCommandBody, encrypted_payload: { ...validPayload, ciphertext: undefined } }],
    ["no tag", { ...validCommandBody, encrypted_payload: { ...validPayload, tag: "" } }],
    ["plaintext instead of encryption", { success: true, command_id: "x", device: "light", command: "LIGHT_ON" }],
  ])("rejects: %s", async (_name, body) => {
    request.mockResolvedValue(body);
    await expect(sendCommand({ device: "light", command: "LIGHT_ON" })).rejects.toMatchObject({
      code: "UNEXPECTED_RESPONSE",
    });
  });
});

describe("GET /api/status response", () => {
  test("returns a simple { device: state } map", async () => {
    request.mockResolvedValue({
      success: true,
      devices: {
        light: { state: "on" },
        fan: { state: "off" },
        door: { state: "closed" },
        pump: { state: "off" },
      },
    });
    expect(await getStatus()).toEqual({ light: "on", fan: "off", door: "closed", pump: "off" });
  });

  test("ignores unknown devices and unknown states", async () => {
    request.mockResolvedValue({
      success: true,
      devices: { light: { state: "on" }, fan: { state: "exploding" }, toaster: { state: "on" } },
    });
    expect(await getStatus()).toEqual({ light: "on" });
  });

  test.each([[null], [{ success: false }], [{ success: true }], [{ success: true, devices: {} }]])(
    "rejects an unusable body %j",
    async (body) => {
      request.mockResolvedValue(body);
      await expect(getStatus()).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE" });
    },
  );
});

describe("POST /api/auth/login response", () => {
  const validLogin = {
    success: true,
    access_token: "abc.def.ghi",
    token_type: "Bearer",
    expires_in: 3600,
    user: { username: "admin", role: "admin" },
  };

  test("a valid response is converted for the app", async () => {
    request.mockResolvedValue(validLogin);
    const result = await login("admin", "pw");

    expect(request).toHaveBeenCalledWith({
      method: "post",
      url: "/api/auth/login",
      data: { username: "admin", password: "pw" },
    });
    expect(result).toEqual({
      accessToken: "abc.def.ghi",
      expiresIn: 3600,
      user: { username: "admin", role: "admin" },
    });
  });

  test.each([
    ["empty body", {}],
    ["success false", { ...validLogin, success: false }],
    ["empty token", { ...validLogin, access_token: "" }],
    ["wrong token type", { ...validLogin, token_type: "Basic" }],
    ["zero expiry", { ...validLogin, expires_in: 0 }],
    ["text expiry", { ...validLogin, expires_in: "3600" }],
    ["unknown role", { ...validLogin, user: { username: "a", role: "root" } }],
    ["no user", { ...validLogin, user: undefined }],
  ])("rejects: %s", async (_name, body) => {
    request.mockResolvedValue(body);
    await expect(login("a", "b")).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE" });
  });

  test("the response never exposes the password back", async () => {
    request.mockResolvedValue(validLogin);
    const result = await login("admin", "super-secret-pw");
    expect(JSON.stringify(result)).not.toContain("super-secret-pw");
  });
});

describe("GET /api/health", () => {
  test("true only for { status: 'ok' }", async () => {
    request.mockResolvedValue({ status: "ok" });
    expect(await getHealth()).toBe(true);
    request.mockResolvedValue({ status: "down" });
    expect(await getHealth()).toBe(false);
    request.mockResolvedValue(null);
    expect(await getHealth()).toBe(false);
  });
});