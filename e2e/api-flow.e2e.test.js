/**
 * @jest-environment node
 */
import { login } from "../src/api/auth";
import client, { setAuthToken } from "../src/api/client";
import { getHealth } from "../src/api/health";
import { getStatus } from "../src/api/status";
import { request } from "../src/api/transport";
import { getResultingState, submitCommand } from "../src/services/commandService";
import { parseVoiceCommand } from "../src/services/voice/commandParser";

// The app's own API layer, pointed at a real backend instead of the mock.
jest.mock("../app/config", () => ({
  __esModule: true,
  default: {
    apiBaseUrl: process.env.E2E_API_URL || "http://127.0.0.1:5000",
    requestTimeoutMs: 15000,
    useMockApi: false,
  },
}));

const ADMIN = {
  username: process.env.E2E_ADMIN_USER,
  password: process.env.E2E_ADMIN_PASSWORD,
};
const VIEWER = {
  username: process.env.E2E_VIEWER_USER,
  password: process.env.E2E_VIEWER_PASSWORD,
};
const hasViewer = Boolean(VIEWER.username && VIEWER.password);

const ALL_COMMANDS = [
  "LIGHT_ON",
  "LIGHT_OFF",
  "FAN_ON",
  "FAN_OFF",
  "DOOR_OPEN",
  "DOOR_CLOSE",
  "PUMP_ON",
  "PUMP_OFF",
];

const bytesOf = (base64) => Buffer.from(base64, "base64");

beforeAll(() => {
  if (!ADMIN.username || !ADMIN.password) {
    throw new Error(
      "Set E2E_ADMIN_USER and E2E_ADMIN_PASSWORD (and optionally E2E_VIEWER_USER / " +
        "E2E_VIEWER_PASSWORD, E2E_API_URL) before running `npm run test:e2e`.",
    );
  }
  // Node's own http module: jest-expo replaces fetch/XMLHttpRequest with test doubles.
  client.defaults.adapter = "http";
});

afterAll(async () => {
  // Leave the house as we found it.
  try {
    const session = await login(ADMIN.username, ADMIN.password);
    setAuthToken(session.accessToken);
    for (const command of ["LIGHT_OFF", "FAN_OFF", "DOOR_CLOSE", "PUMP_OFF"]) {
      await submitCommand(command);
    }
  } catch {
    // best effort only
  }
  setAuthToken(null);
});

describe("signing in", () => {
  test("the backend is reachable", async () => {
    expect(await getHealth()).toBe(true);
  });

  test("protected data needs a token", async () => {
    setAuthToken(null);
    await expect(getStatus()).rejects.toMatchObject({ isApiError: true, code: "UNAUTHORIZED" });
  });

  test("a made-up token is rejected", async () => {
    setAuthToken("not.a.real.token");
    await expect(getStatus()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    setAuthToken(null);
  });

  test("a wrong password is refused without ending anything", async () => {
    await expect(login(ADMIN.username, `${ADMIN.password}-wrong`)).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  test("the right password gives a usable session", async () => {
    const session = await login(ADMIN.username, ADMIN.password);
    expect(session.accessToken.split(".")).toHaveLength(3);
    expect(session.expiresIn).toBeGreaterThan(0);
    expect(session.user.role).toBe("admin");
    setAuthToken(session.accessToken);

    const states = await getStatus();
    expect(Object.keys(states).sort()).toEqual(["door", "fan", "light", "pump"]);
  });
});

describe("a voice command all the way through", () => {
  test('"turn on the light" -> LIGHT_ON -> backend -> encrypted result -> state change', async () => {
    const heard = parseVoiceCommand("turn on the light");
    expect(heard).toEqual({ ok: true, command: "LIGHT_ON", device: "light" });

    const result = await submitCommand(heard.command);

    expect(result.command).toEqual({ device: "light", command: "LIGHT_ON" });
    expect(result.commandId).toEqual(expect.any(String));
    expect(result.encryptedPayload.algorithm).toBe("AES-256-GCM");

    expect((await getStatus()).light).toBe("on");
  });

  test("the app receives an AES-GCM payload that hides the command", async () => {
    const { encryptedPayload } = await submitCommand("FAN_ON");

    expect(bytesOf(encryptedPayload.nonce)).toHaveLength(12);
    expect(bytesOf(encryptedPayload.tag)).toHaveLength(16);
    expect(bytesOf(encryptedPayload.ciphertext).length).toBeGreaterThan(20);
    expect(JSON.stringify(encryptedPayload)).not.toContain("FAN_ON");
    expect(bytesOf(encryptedPayload.ciphertext).toString("utf8")).not.toContain("FAN_ON");
  });

  test("spoken refusals send nothing: the state stays as it was", async () => {
    const before = await getStatus();
    for (const phrase of ["don't open the door", "is the light on", "turn on the light and the fan"]) {
      expect(parseVoiceCommand(phrase).ok).toBe(false);
    }
    expect(await getStatus()).toEqual(before);
  });
});

describe("every command", () => {
  test.each(ALL_COMMANDS)("%s is accepted and the backend state follows", async (command) => {
    const result = await submitCommand(command);
    expect(result.encryptedPayload.algorithm).toBe("AES-256-GCM");

    const states = await getStatus();
    expect(states[result.command.device]).toBe(getResultingState(command));
  });

  test("two identical commands never produce the same message", async () => {
    const first = await submitCommand("LIGHT_ON");
    const second = await submitCommand("LIGHT_ON");

    expect(first.commandId).not.toBe(second.commandId);
    expect(first.encryptedPayload.nonce).not.toBe(second.encryptedPayload.nonce);
    expect(first.encryptedPayload.ciphertext).not.toBe(second.encryptedPayload.ciphertext);
  });
});

describe("the backend as the last line of defence", () => {
  test("it refuses a mismatched command even if the app is bypassed", async () => {
    const before = await getStatus();
    await expect(
      request({ method: "post", url: "/api/commands", data: { device: "light", command: "FAN_ON" } }),
    ).rejects.toMatchObject({ code: "COMMAND_DEVICE_MISMATCH" });
    expect(await getStatus()).toEqual(before);
  });

  test("it refuses an unknown command", async () => {
    await expect(
      request({ method: "post", url: "/api/commands", data: { device: "light", command: "LIGHT_DIM" } }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  });

  test("it ignores a client-supplied timestamp", async () => {
    // The response never contains one, and the request is accepted normally.
    const body = await request({
      method: "post",
      url: "/api/commands",
      data: { device: "pump", command: "PUMP_OFF", timestamp: 1 },
    });
    expect(body.success).toBe(true);
    expect(body).not.toHaveProperty("timestamp");
  });
});

(hasViewer ? describe : describe.skip)("a viewer account", () => {
  test("can read the status but cannot control devices", async () => {
    const adminToken = client.defaults.headers.common.Authorization.replace("Bearer ", "");

    const viewer = await login(VIEWER.username, VIEWER.password);
    expect(viewer.user.role).toBe("viewer");
    setAuthToken(viewer.accessToken);

    const before = await getStatus();
    await expect(submitCommand("DOOR_OPEN")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await getStatus()).toEqual(before);

    setAuthToken(adminToken);
  });
});