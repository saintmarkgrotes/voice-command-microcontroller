import { COMMAND_DEFINITIONS, DEVICE_CONFIG } from "../constants/deviceConfig";
import { DEVICE_TYPE_LIST } from "../constants/deviceTypes";

// Return a fresh map so the dashboard and mock backend never share mutable state.
export function buildInitialStates() {
  return Object.fromEntries(
    DEVICE_TYPE_LIST.map((id) => [id, DEVICE_CONFIG[id].defaultState]),
  );
}

export function toDeviceViews(states) {
  return DEVICE_TYPE_LIST.map((id) => {
    const { name, icon, activeState, activeTone, actions } = DEVICE_CONFIG[id];
    const state = states[id];
    return {
      id,
      name,
      icon,
      state,
      tone: state === activeState ? activeTone : "inactive",
      actions: actions.map(({ label, command }) => ({
        label,
        command,
        selected: COMMAND_DEFINITIONS[command].resultState === state,
      })),
    };
  });
}
