import { AxiosError } from "axios";

import client, { setAuthToken } from "../client";
import { setUnauthorizedHandler } from "../session";

function respondWith(status, data) {
  client.defaults.adapter = async (config) => {
    const response = { data, status, statusText: "", headers: {}, config, request: {} };
    if (status >= 200 && status < 300) return response;
    throw new AxiosError("failed", "ERR_BAD_RESPONSE", config, {}, response);
  };
}

const errorBody = (code) => ({ success: false, error: { code, message: "server text" } });

const handler = jest.fn();

beforeEach(() => {
  handler.mockClear();
  setUnauthorizedHandler(handler);
  setAuthToken(null);
});

afterAll(() => setUnauthorizedHandler(null));

describe("auth token header", () => {
  test("setAuthToken adds and removes the Bearer header", async () => {
    setAuthToken("abc");
    expect(client.defaults.headers.common.Authorization).toBe("Bearer abc");
    setAuthToken(null);
    expect(client.defaults.headers.common.Authorization).toBeUndefined();
  });

  test("requests carry the header", async () => {
    let sent;
    client.defaults.adapter = async (config) => {
      sent = config.headers.get("Authorization");
      return { data: {}, status: 200, statusText: "", headers: {}, config, request: {} };
    };
    setAuthToken("abc");
    await client.get("/api/status");
    expect(sent).toBe("Bearer abc");
  });
});

describe("session end detection", () => {
  test("401 UNAUTHORIZED tells the app which token was rejected", async () => {
    respondWith(401, errorBody("UNAUTHORIZED"));
    setAuthToken("old-token");

    await expect(client.get("/api/status")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("Bearer old-token");
  });

  test("a wrong password (INVALID_CREDENTIALS) does NOT end a session", async () => {
    respondWith(401, errorBody("INVALID_CREDENTIALS"));
    await expect(client.post("/api/auth/login", {})).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(handler).not.toHaveBeenCalled();
  });

  test.each([["FORBIDDEN", 403], ["RATE_LIMITED", 429], ["INVALID_COMMAND", 400]])(
    "%s does not end a session",
    async (code, status) => {
      respondWith(status, errorBody(code));
      setAuthToken("abc");
      await expect(client.get("/x")).rejects.toMatchObject({ code });
      expect(handler).not.toHaveBeenCalled();
    },
  );
});

describe("error normalization", () => {
  test("every failure is an ApiError", async () => {
    respondWith(403, errorBody("FORBIDDEN"));
    await expect(client.get("/x")).rejects.toMatchObject({ isApiError: true, code: "FORBIDDEN" });
  });

  test("a server error without a contract body -> SERVER_ERROR", async () => {
    respondWith(500, "<html>Internal Server Error</html>");
    await expect(client.get("/x")).rejects.toMatchObject({ code: "SERVER_ERROR", status: 500 });
  });

  test("a client error without a contract body -> UNEXPECTED_RESPONSE", async () => {
    respondWith(404, "<html>Not found</html>");
    await expect(client.get("/x")).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE" });
  });

  test("no answer at all -> NETWORK_ERROR", async () => {
    client.defaults.adapter = async (config) => {
      throw new AxiosError("Network Error", "ERR_NETWORK", config, {});
    };
    await expect(client.get("/x")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  test("a timeout -> TIMEOUT", async () => {
    client.defaults.adapter = async (config) => {
      throw new AxiosError("timeout", "ECONNABORTED", config, {});
    };
    await expect(client.get("/x")).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});