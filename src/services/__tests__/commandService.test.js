import { sendCommand as sendCommandRequest } from "../../api/commands";
import {
  createCommand,
  getResultingState,
  submitCommand,
  validateCommand,
} from "../commandService";

jest.mock("../../api/commands", () => ({ sendCommand: jest.fn() }));

const ALL_COMMANDS = [
  ["LIGHT_ON", "light", "on"],
  ["LIGHT_OFF", "light", "off"],
  ["FAN_ON", "fan", "on"],
  ["FAN_OFF", "fan", "off"],
  ["DOOR_OPEN", "door", "open"],
  ["DOOR_CLOSE", "door", "closed"],
  ["PUMP_ON", "pump", "on"],
  ["PUMP_OFF", "pump", "off"],
];

beforeEach(() => jest.clearAllMocks());

describe("command model", () => {
  test.each(ALL_COMMANDS)("%s belongs to %s and results in '%s'", (command, device, state) => {
    expect(createCommand(command)).toEqual({ device, command });
    expect(validateCommand({ device, command })).toEqual({ valid: true, error: null });
    expect(getResultingState(command)).toBe(state);
  });

  test("createCommand returns a frozen object", () => {
    expect(Object.isFrozen(createCommand("LIGHT_ON"))).toBe(true);
  });

  test.each([
    [null, "INVALID_PAYLOAD"],
    ["LIGHT_ON", "INVALID_PAYLOAD"],
    [[], "INVALID_PAYLOAD"],
    [{ device: "light" }, "MISSING_FIELDS"],
    [{ command: "LIGHT_ON" }, "MISSING_FIELDS"],
    [{ device: 1, command: "LIGHT_ON" }, "MISSING_FIELDS"],
    [{ device: "toaster", command: "LIGHT_ON" }, "UNKNOWN_DEVICE"],
    [{ device: "light", command: "LIGHT_DIM" }, "UNKNOWN_COMMAND"],
    [{ device: "light", command: "toString" }, "UNKNOWN_COMMAND"], // inherited property, not a command
    [{ device: "light", command: "FAN_ON" }, "COMMAND_DEVICE_MISMATCH"],
  ])("validateCommand rejects %j with %s", (payload, code) => {
    const result = validateCommand(payload);
    expect(result.valid).toBe(false);
    expect(result.error.code).toBe(code);
  });

  test("createCommand throws an Error carrying the code", () => {
    expect(() => createCommand("LIGHT_DIM")).toThrow(
      expect.objectContaining({ code: "UNKNOWN_COMMAND" }),
    );
  });
});

describe("submitCommand", () => {
  test("sends { device, command } and returns the secured result", async () => {
    sendCommandRequest.mockResolvedValue({
      commandId: "id-1",
      device: "fan",
      encryptedPayload: { algorithm: "AES-256-GCM", nonce: "n", ciphertext: "c", tag: "t" },
    });

    const result = await submitCommand("FAN_ON");

    expect(sendCommandRequest).toHaveBeenCalledWith({ device: "fan", command: "FAN_ON" });
    expect(result).toEqual({
      command: { device: "fan", command: "FAN_ON" },
      commandId: "id-1",
      encryptedPayload: { algorithm: "AES-256-GCM", nonce: "n", ciphertext: "c", tag: "t" },
    });
  });

  test("an invalid command never reaches the API", async () => {
    await expect(submitCommand("LIGHT_DIM")).rejects.toMatchObject({ code: "UNKNOWN_COMMAND" });
    expect(sendCommandRequest).not.toHaveBeenCalled();
  });

  test("API failures are passed on unchanged", async () => {
    const failure = Object.assign(new Error("x"), { code: "FORBIDDEN" });
    sendCommandRequest.mockRejectedValue(failure);
    await expect(submitCommand("LIGHT_ON")).rejects.toBe(failure);
  });
});