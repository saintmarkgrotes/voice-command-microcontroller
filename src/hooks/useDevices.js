import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

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
  const [pendingCommand, setPendingCommand] = useState(null); // the command being sent right now
  const [isRefreshing, setIsRefreshing] = useState(false); // true during pull-to-refresh
  const [lastResult, setLastResult] = useState(null);

  const isMounted = useRef(true);
  const inFlight = useRef(false);
  const refreshInFlight = useRef(null);
  const commandCount = useRef(0); // successful commands so far

  // Fetches device states. Calls made while one is already running share that request.
  const refresh = useCallback(() => {
    if (refreshInFlight.current) return refreshInFlight.current;

    const commandsAtStart = commandCount.current;

    const run = async () => {
      try {
        const remoteStates = await getStatus();
        if (!isMounted.current) return;
        // If a command finished while this request was in flight, the answer may be
        // older than what the person just did. Keep the newer states on screen.
        if (commandCount.current === commandsAtStart) {
          setStates((previous) => ({ ...previous, ...remoteStates }));
        }
        setConnection("connected");
      } catch (error) {
        if (!isMounted.current) return;
        setConnection("disconnected");
        setLastResult({
          ok: false,
          code: error.code,
          message: getUserMessage(error),
        });
      } finally {
        refreshInFlight.current = null;
      }
    };

    refreshInFlight.current = run();
    return refreshInFlight.current;
  }, []);

  useEffect(() => {
    isMounted.current = true;
    refresh();
    return () => {
      isMounted.current = false;
    };
  }, [refresh]);

  // Device states may have changed while the app was in the background.
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (previous !== "active" && next === "active") refresh();
      previous = next;
    });
    return () => subscription.remove();
  }, [refresh]);

  // Pull-to-refresh: drives the spinner, then reloads the device states.
  const onRefresh = useCallback(async () => {
    if (inFlight.current) return; // a command is running; its result is newer than any refresh
    setIsRefreshing(true);
    await refresh();
    if (isMounted.current) setIsRefreshing(false);
  }, [refresh]);

  // Accepts a COMMAND_TYPES value. Resolves after the request finishes.
  const sendCommand = useCallback(async (command) => {
    if (inFlight.current) return; // ignore rapid double taps
    inFlight.current = true;
    setIsSending(true);
    setPendingCommand(command);

    try {
      const result = await submitCommand(command);
      if (!isMounted.current) return;

      commandCount.current += 1;
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
      if (isMounted.current) {
        setIsSending(false);
        setPendingCommand(null);
      }
    }
  }, []);

  const devices = DEVICE_TYPE_LIST.map((deviceId) =>
    toDeviceView(deviceId, states[deviceId]),
  );

  return {
    devices,
    connection,
    isSending,
    pendingCommand,
    isRefreshing,
    lastResult,
    sendCommand,
    refresh,
    onRefresh,
    isMockMode: config.useMockApi,
  };
}