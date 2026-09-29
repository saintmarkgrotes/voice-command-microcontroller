import config from "../../app/config";
import client from "./client";
import { mockRequest } from "./mock/mockBackend";

// The single switch between the real backend and the mock one.
// Both resolve with the response BODY (parsed JSON) and reject with an ApiError.
export function request({ method, url, data }) {
  if (config.useMockApi) {
    return mockRequest({ method, url, data });
  }
  return client
    .request({ method, url, data })
    .then((response) => response.data);
}
