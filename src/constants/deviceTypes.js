// Device identifiers. These exact strings are sent to the backend as "device".
export const DEVICE_TYPES = Object.freeze({
  LIGHT: "light",
  FAN: "fan",
  DOOR: "door",
  PUMP: "pump",
});

// Display order on the dashboard.
export const DEVICE_TYPE_LIST = Object.freeze(Object.values(DEVICE_TYPES));
