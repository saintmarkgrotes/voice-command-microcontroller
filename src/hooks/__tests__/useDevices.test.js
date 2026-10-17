import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";

import { getDeviceStates } from "../../services/deviceService";
import { submitCommand } from "../../services/commandService";
import useDevices from "../useDevices";

jest.mock("../../../app/config", () => ({
  __esModule: true,
  default: { apiBaseUrl: "http://test", requestTimeoutMs: 1000, useMockApi: false },
}));
jest.mock("../../services/deviceService", () => ({ getDeviceStates: jest.fn() }));
jest.mock("../../services/commandService", () => ({
  ...jest.requireActual("../../services/commandService"),
  submitCommand: jest.fn(),
}));

const STATES = { light: "off", fan: "off", door: "closed", pump: "off" };
const PAYLOAD = { algorithm: "AES-256-GCM", nonce: "bg==", ciphertext: "Yw==", tag: "dA==" };

const commandResult = (command, device) => ({
  command: { device, command },
  commandId: `id-${command}`,
  encryptedPayload: PAYLOAD,
});
const apiError = (code) => Object.assign(new Error(code), { code, isApiError: true });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const stateOf = (result, id) => result.current.devices.find((d) => d.id === id).state;

let appStateHandler;
let removeListener;
let appStateSpy;

async function mount() {
  const hook = await renderHook(() => useDevices());
  await waitFor(() => expect(hook.result.current.connection).not.toBe("checking"));
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  getDeviceStates.mockResolvedValue({ ...STATES });
  removeListener = jest.fn();
  appStateHandler = undefined;
  appStateSpy = jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
    appStateHandler = handler;
    return { remove: removeListener };
  });
});

afterEach(() => appStateSpy.mockRestore());

describe("loading", () => {
  test("loads device states from the backend", async () => {
    getDeviceStates.mockResolvedValue({ ...STATES, light: "on", door: "open" });
    const { result } = await mount();

    expect(result.current.connection).toBe("connected");
    expect(stateOf(result, "light")).toBe("on");
    expect(stateOf(result, "door")).toBe("open");
    expect(getDeviceStates).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ isRefreshing: false, isSending: false, pendingCommand: null });
  });

  test("a failed load shows offline and a friendly message", async () => {
    getDeviceStates.mockRejectedValue(apiError("NETWORK_ERROR"));
    const { result } = await mount();

    expect(result.current.connection).toBe("disconnected");
    expect(result.current.lastResult.ok).toBe(false);
    expect(result.current.lastResult.message).toContain("Unable to connect to the backend.");
    expect(stateOf(result, "light")).toBe("off"); // defaults stay
  });

  test("each device offers its two actions, the current one selected", async () => {
    getDeviceStates.mockResolvedValue({ ...STATES, light: "on" });
    const { result } = await mount();
    const light = result.current.devices.find((d) => d.id === "light");
    expect(light.actions.map((a) => [a.command, a.selected])).toEqual([
      ["LIGHT_ON", true],
      ["LIGHT_OFF", false],
    ]);
  });
});

describe("pull-to-refresh", () => {
  test("shows the spinner while loading, then the new states", async () => {
    const { result } = await mount();
    const pending = deferred();
    getDeviceStates.mockReturnValue(pending.promise);

    let refreshing;
    await act(() => {
      refreshing = result.current.onRefresh();
    });
    expect(result.current.isRefreshing).toBe(true);

    await act(async () => {
      pending.resolve({ ...STATES, fan: "on" });
      await refreshing;
    });
    expect(result.current.isRefreshing).toBe(false);
    expect(stateOf(result, "fan")).toBe("on");
  });

  test("offline: spinner stops, last known states stay, banner state is set", async () => {
    getDeviceStates.mockResolvedValue({ ...STATES, light: "on" });
    const { result } = await mount();
    getDeviceStates.mockRejectedValue(apiError("TIMEOUT"));

    await act(() => result.current.onRefresh());

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.connection).toBe("disconnected");
    expect(stateOf(result, "light")).toBe("on");

    getDeviceStates.mockResolvedValue({ ...STATES, light: "on" });
    await act(() => result.current.onRefresh());
    expect(result.current.connection).toBe("connected");
  });

  test("two refreshes at once share one request", async () => {
    const { result } = await mount();
    getDeviceStates.mockClear();
    const pending = deferred();
    getDeviceStates.mockReturnValue(pending.promise);

    let first;
    let second;
    await act(() => {
      first = result.current.refresh();
      second = result.current.refresh();
    });
    expect(second).toBe(first);
    expect(getDeviceStates).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ ...STATES });
      await first;
    });
  });

  test("is ignored while a command is running", async () => {
    const { result } = await mount();
    const sending = deferred();
    submitCommand.mockReturnValue(sending.promise);
    getDeviceStates.mockClear();

    let command;
    await act(() => {
      command = result.current.sendCommand("LIGHT_ON");
    });
    await act(() => result.current.onRefresh());

    expect(getDeviceStates).not.toHaveBeenCalled();
    expect(result.current.isRefreshing).toBe(false);

    await act(async () => {
      sending.resolve(commandResult("LIGHT_ON", "light"));
      await command;
    });
  });
});

describe("the refresh race", () => {
  test("a slow refresh that started BEFORE a command cannot undo it", async () => {
    const { result } = await mount();
    const slowRefresh = deferred();
    getDeviceStates.mockReturnValue(slowRefresh.promise); // will answer with the OLD state
    submitCommand.mockResolvedValue(commandResult("LIGHT_ON", "light"));

    let refreshing;
    await act(() => {
      refreshing = result.current.refresh();
    });
    await act(() => result.current.sendCommand("LIGHT_ON"));
    expect(stateOf(result, "light")).toBe("on");

    await act(async () => {
      slowRefresh.resolve({ ...STATES }); // light: off, now out of date
      await refreshing;
    });

    expect(stateOf(result, "light")).toBe("on"); // not reverted
    expect(result.current.connection).toBe("connected");

    // The next refresh starts after the command, so its answer is trusted.
    getDeviceStates.mockResolvedValue({ ...STATES, light: "on" });
    await act(() => result.current.refresh());
    expect(stateOf(result, "light")).toBe("on");
  });
});

describe("sending commands", () => {
  test("pendingCommand is set while sending, the state changes only on success", async () => {
    const { result } = await mount();
    const sending = deferred();
    submitCommand.mockReturnValue(sending.promise);

    let command;
    await act(() => {
      command = result.current.sendCommand("LIGHT_ON");
    });
    expect(result.current).toMatchObject({ isSending: true, pendingCommand: "LIGHT_ON" });
    expect(stateOf(result, "light")).toBe("off"); // not yet confirmed

    await act(async () => {
      sending.resolve(commandResult("LIGHT_ON", "light"));
      await command;
    });

    expect(result.current).toMatchObject({ isSending: false, pendingCommand: null });
    expect(stateOf(result, "light")).toBe("on");
    expect(result.current.lastResult).toMatchObject({
      ok: true,
      commandId: "id-LIGHT_ON",
      encryptedPayload: PAYLOAD,
    });
  });

  test.each([
    ["DOOR_OPEN", "door", "open"],
    ["DOOR_CLOSE", "door", "closed"],
    ["PUMP_ON", "pump", "on"],
    ["FAN_OFF", "fan", "off"],
  ])("%s sets %s to %s", async (command, device, expected) => {
    const { result } = await mount();
    submitCommand.mockResolvedValue(commandResult(command, device));
    await act(() => result.current.sendCommand(command));
    expect(stateOf(result, device)).toBe(expected);
  });

  test("a rejected command changes nothing and shows a friendly message", async () => {
    const { result } = await mount();
    submitCommand.mockRejectedValue(apiError("FORBIDDEN"));

    await act(() => result.current.sendCommand("LIGHT_ON"));

    expect(stateOf(result, "light")).toBe("off");
    expect(result.current.lastResult).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(result.current.lastResult.message).toContain("permission");
    expect(result.current.connection).toBe("connected"); // the backend answered, so it is online
    expect(result.current).toMatchObject({ isSending: false, pendingCommand: null });
  });

  test.each(["NETWORK_ERROR", "TIMEOUT", "SERVICE_UNAVAILABLE"])(
    "%s marks the backend as disconnected",
    async (code) => {
      const { result } = await mount();
      submitCommand.mockRejectedValue(apiError(code));
      await act(() => result.current.sendCommand("LIGHT_ON"));
      expect(result.current.connection).toBe("disconnected");
    },
  );

  test("a second tap while one is in flight is ignored", async () => {
    const { result } = await mount();
    const sending = deferred();
    submitCommand.mockReturnValue(sending.promise);

    let first;
    await act(() => {
      first = result.current.sendCommand("LIGHT_ON");
      result.current.sendCommand("LIGHT_OFF");
    });
    expect(submitCommand).toHaveBeenCalledTimes(1);
    expect(submitCommand).toHaveBeenCalledWith("LIGHT_ON");

    await act(async () => {
      sending.resolve(commandResult("LIGHT_ON", "light"));
      await first;
    });
  });
});

describe("returning to the app", () => {
  test("refreshes when the app comes back to the foreground, and only then", async () => {
    await mount();
    getDeviceStates.mockClear();

    await act(() => appStateHandler("background"));
    expect(getDeviceStates).not.toHaveBeenCalled();

    await act(() => appStateHandler("active"));
    expect(getDeviceStates).toHaveBeenCalledTimes(1);

    await act(() => appStateHandler("active"));
    expect(getDeviceStates).toHaveBeenCalledTimes(1);
  });
});

describe("unmounting", () => {
  test("removes the AppState listener", async () => {
    const hook = await mount();
    await hook.unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  test("a response arriving after unmount is dropped quietly", async () => {
    const hook = await mount();
    const late = deferred();
    submitCommand.mockReturnValue(late.promise);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    let sending;
    await act(() => {
      sending = hook.result.current.sendCommand("LIGHT_ON");
    });
    await hook.unmount();
    late.resolve(commandResult("LIGHT_ON", "light"));
    await sending;

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});