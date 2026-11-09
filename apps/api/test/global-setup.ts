import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import { migrateTemplate } from "./migrate-template";
import { createDatabase, dropDatabase, TEMPLATE_DATABASE, withDatabase } from "./pg-admin";

/**
 * api-int global setup (design 16, ADR12). Runs ONCE per `vitest run`:
 *   1. get a Postgres 17 server: Testcontainers (default) or VK_TEST_DATABASE_URL (fallback, e.g.
 *      the docker-compose.dev.yml postgres when no Docker socket is reachable from the test runner);
 *   2. (re)create the template database and migrate it;
 *   3. hand the server URL to test files, which clone the template per FILE (see test/db.ts).
 */

export const PG_IMAGE = "postgres:17-alpine";
export const FALLBACK_ENV = "VK_TEST_DATABASE_URL";

declare module "vitest" {
  export interface ProvidedContext {
    /** Connection URL of the test server's maintenance database (never used by tests directly). */
    vkTestServerUrl: string;
  }
}

interface TestServer {
  url: string;
  stop(): Promise<void>;
}

async function startServer(): Promise<TestServer> {
  const fallback = process.env[FALLBACK_ENV]?.trim();
  if (fallback) {
    return { url: fallback, stop: async () => {} };
  }
  try {
    const container = await new PostgreSqlContainer(PG_IMAGE).start();
    return {
      url: container.getConnectionUri(),
      stop: async () => {
        await container.stop();
      },
    };
  } catch (cause) {
    throw new Error(
      `api-int needs Docker for Testcontainers (${PG_IMAGE}). Start Docker, or set ${FALLBACK_ENV} ` +
        "to a Postgres 17 server URL (e.g. the docker-compose.dev.yml postgres).",
      { cause },
    );
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const server = await startServer();
  const templateUrl = withDatabase(server.url, TEMPLATE_DATABASE);

  await dropDatabase(server.url, TEMPLATE_DATABASE);
  await createDatabase(server.url, TEMPLATE_DATABASE);
  await migrateTemplate(templateUrl);

  project.provide("vkTestServerUrl", server.url);

  return async () => {
    await dropDatabase(server.url, TEMPLATE_DATABASE);
    await server.stop();
  };
}
