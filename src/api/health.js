import { request } from "./transport";

// GET /api/health -> { "status": "ok" }
export async function getHealth() {
  const body = await request({ method: "get", url: "/api/health" });
  return Boolean(body) && body.status === "ok";
}
