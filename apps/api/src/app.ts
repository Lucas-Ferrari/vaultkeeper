import { Hono } from "hono";

export interface HealthResponse {
  status: "ok";
}

/**
 * App factory (manual DI, ADR13). Dependencies are added as parameters as features land.
 * /healthz is a stub for now; the DB ping is added in task 2.12.
 */
export function createApp() {
  return new Hono().get("/healthz", (c) => c.json<HealthResponse>({ status: "ok" }, 200));
}

export type App = ReturnType<typeof createApp>;
