import { Client, escapeIdentifier } from "pg";

/** Template database every test file clones (design 16, ADR12). */
export const TEMPLATE_DATABASE = "vk_template";

/** Returns `serverUrl` pointing at another database on the same server. */
export function withDatabase(serverUrl: string, database: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

/** Runs `fn` with a short-lived connection; always closes it so templates stay clonable. */
export async function withClient<T>(url: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function dropDatabase(serverUrl: string, database: string): Promise<void> {
  await withClient(serverUrl, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(database)} WITH (FORCE)`);
  });
}

export async function createDatabase(
  serverUrl: string,
  database: string,
  template?: string,
): Promise<void> {
  const from = template === undefined ? "" : ` TEMPLATE ${escapeIdentifier(template)}`;
  await withClient(serverUrl, async (client) => {
    await client.query(`CREATE DATABASE ${escapeIdentifier(database)}${from}`);
  });
}
