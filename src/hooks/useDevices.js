import { useCallback, useEffect, useRef, useState } from "react";

import config from "../../app/config";
import { getStatus } from "../api/status";
import { COMMAND_DEFINITIONS, DEVICE_CONFIG } from "../constants/deviceConfig";
import { DEVICE_TYPE_LIST } from "../constants/deviceTypes";
import { getResultingState, submitCommand } from "../services/commandService";
import { getUserMessage } from "../utils/errorMessages";

const CONNECTION_ERROR_CODES = [
  "NETWORK_ERROR",
  "TIMEOUT",
  "SERVICE_UNAVAILABLE",
];

function buildInitialStates() {
  return DEVICE_TYPE_LIST.reduce((states, deviceId) => {
    states[deviceId] = DEVICE_CONFIG[deviceId].defaultState;
    return states;
  }, {});
}

// Combines static config with current state into what the UI renders.
function toDeviceView(deviceId, state) {
  const deviceConfig = DEVICE_CONFIG[deviceId];

  return {
    id: deviceId,
    name: deviceConfig.name,
    icon: deviceConfig.icon,
    state,
    tone:
      state === deviceConfig.activeState ? deviceConfig.activeTone : "inactive",
    actions: deviceConfig.actions.map((action) => ({
      label: action.label,
      command: action.command,
      selected: COMMAND_DEFINITIONS[action.command].resultState === state,
    })),
  };
}

// API-backed device state. Device state changes ONLY after the backend
// confirms a command; a failed request leaves the UI untouched.
export default function useDevices() {
  const [states, setStates] = useState(buildInitialStates);
  const [connection, setConnection] = useState("checking"); // 'checking' | 'connected' | 'disconnected'
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const isMounted = useRef(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const remoteStates = await getStatus();
      if (!isMounted.current) return;
      setStates((previous) => ({ ...previous, ...remoteStates }));
      setConnection("connected");
    } catch (error) {
      if (!isMounted.current) return;
      setConnection("disconnected");
      setLastResult({
        ok: false,
        code: error.code,
        message: getUserMessage(error),
      });
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    refresh();
    return () => {
      isMounted.current = false;
    };
  }, [refresh]);

  // Accepts a COMMAND_TYPES value. Resolves after the request finishes.
  const sendCommand = useCallback(async (command) => {
    if (inFlight.current) return; // ignore rapid double taps
    inFlight.current = true;
    setIsSending(true);

    try {
      const result = await submitCommand(command);
      if (!isMounted.current) return;

      setStates((previous) => ({
        ...previous,
        [result.command.device]: getResultingState(result.command.command),
      }));
      setConnection("connected");
      setLastResult({
        ok: true,
        command: result.command,
        commandId: result.commandId,
        encryptedPayload: result.encryptedPayload,
      });
    } catch (error) {
      if (!isMounted.current) return;
      if (CONNECTION_ERROR_CODES.includes(error.code)) {
        setConnection("disconnected");
      }
      setLastResult({
        ok: false,
        code: error.code,
        message: getUserMessage(error),
      });
    } finally {
      inFlight.current = false;
      if (isMounted.current) setIsSending(false);
    }
  }, []);

  const devices = DEVICE_TYPE_LIST.map((deviceId) =>
    toDeviceView(deviceId, states[deviceId]),
  );

  return {
    devices,
    connection,
    isSending,
    lastResult,
    sendCommand,
    refresh,
    isMockMode: config.useMockApi,
  };
}
