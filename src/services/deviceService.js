import { getStatus } from "../api/status";

export function getDeviceStates() {
  return getStatus();
}
