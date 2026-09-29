import { COMMAND_TYPES } from "./commandTypes";
import { DEVICE_STATES } from "./deviceStates";
import { DEVICE_TYPES } from "./deviceTypes";

// Single source of truth linking each command to its device and the state it produces.
// Command/device compatibility rules are derived from this table.
export const COMMAND_DEFINITIONS = Object.freeze({
  [COMMAND_TYPES.LIGHT_ON]: {
    device: DEVICE_TYPES.LIGHT,
    resultState: DEVICE_STATES.ON,
  },
  [COMMAND_TYPES.LIGHT_OFF]: {
    device: DEVICE_TYPES.LIGHT,
    resultState: DEVICE_STATES.OFF,
  },

  [COMMAND_TYPES.FAN_ON]: {
    device: DEVICE_TYPES.FAN,
    resultState: DEVICE_STATES.ON,
  },
  [COMMAND_TYPES.FAN_OFF]: {
    device: DEVICE_TYPES.FAN,
    resultState: DEVICE_STATES.OFF,
  },

  [COMMAND_TYPES.DOOR_OPEN]: {
    device: DEVICE_TYPES.DOOR,
    resultState: DEVICE_STATES.OPEN,
  },
  [COMMAND_TYPES.DOOR_CLOSE]: {
    device: DEVICE_TYPES.DOOR,
    resultState: DEVICE_STATES.CLOSED,
  },

  [COMMAND_TYPES.PUMP_ON]: {
    device: DEVICE_TYPES.PUMP,
    resultState: DEVICE_STATES.ON,
  },
  [COMMAND_TYPES.PUMP_OFF]: {
    device: DEVICE_TYPES.PUMP,
    resultState: DEVICE_STATES.OFF,
  },
});

// Per-device presentation and behavior.
// activeState / activeTone decide when a device is highlighted (an open door is a caution state).
// actions lists the buttons, in order, and which command each one sends.
export const DEVICE_CONFIG = Object.freeze({
  [DEVICE_TYPES.LIGHT]: {
    name: "Light",
    icon: "💡",
    defaultState: DEVICE_STATES.OFF,
    activeState: DEVICE_STATES.ON,
    activeTone: "active",
    actions: [
      { label: "ON", command: COMMAND_TYPES.LIGHT_ON },
      { label: "OFF", command: COMMAND_TYPES.LIGHT_OFF },
    ],
  },
  [DEVICE_TYPES.FAN]: {
    name: "Fan",
    icon: "🌀",
    defaultState: DEVICE_STATES.OFF,
    activeState: DEVICE_STATES.ON,
    activeTone: "active",
    actions: [
      { label: "ON", command: COMMAND_TYPES.FAN_ON },
      { label: "OFF", command: COMMAND_TYPES.FAN_OFF },
    ],
  },
  [DEVICE_TYPES.DOOR]: {
    name: "Door",
    icon: "🚪",
    defaultState: DEVICE_STATES.CLOSED,
    activeState: DEVICE_STATES.OPEN,
    activeTone: "warning",
    actions: [
      { label: "OPEN", command: COMMAND_TYPES.DOOR_OPEN },
      { label: "CLOSE", command: COMMAND_TYPES.DOOR_CLOSE },
    ],
  },
  [DEVICE_TYPES.PUMP]: {
    name: "Water Pump",
    icon: "💧",
    defaultState: DEVICE_STATES.OFF,
    activeState: DEVICE_STATES.ON,
    activeTone: "active",
    actions: [
      { label: "ON", command: COMMAND_TYPES.PUMP_ON },
      { label: "OFF", command: COMMAND_TYPES.PUMP_OFF },
    ],
  },
});
