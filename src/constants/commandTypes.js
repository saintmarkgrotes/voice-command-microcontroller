// Standardized commands. These exact strings are sent to the backend as "command".
export const COMMAND_TYPES = Object.freeze({
  LIGHT_ON: "LIGHT_ON",
  LIGHT_OFF: "LIGHT_OFF",

  FAN_ON: "FAN_ON",
  FAN_OFF: "FAN_OFF",

  DOOR_OPEN: "DOOR_OPEN",
  DOOR_CLOSE: "DOOR_CLOSE",

  PUMP_ON: "PUMP_ON",
  PUMP_OFF: "PUMP_OFF",
});
