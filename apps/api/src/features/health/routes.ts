import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "../../db/client";

export const HEALTH_STATUS = {
  OK: "ok",
  UNAVAILABLE: "unavailable",
} as const;
export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];

export interface HealthResponse {
  status: HealthStatus;
}

/**
 * GET /healthz (R-DEP-3, design 03): public, 200 only while the database answers. The failure
 * body says nothing about why (no host, no driver message): it is reachable without a session.
 */
export function healthRoutes(db: Database) {
  return new Hono().get("/", async (c) => {
    try {
      await db.execute(sql`select 1`);
      return c.json<HealthResponse>({ status: HEALTH_STATUS.OK }, 200);
    } catch {
      return c.json<HealthResponse>({ status: HEALTH_STATUS.UNAVAILABLE }, 503);
    }
  });
}
