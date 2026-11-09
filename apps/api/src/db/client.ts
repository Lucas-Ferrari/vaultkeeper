import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;
/** The `tx` handed to `db.transaction(fn)`. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Repositories accept either, so services decide the transaction boundary (design 02). */
export type DbOrTx = Database | Transaction;

export interface DatabaseHandle {
  db: Database;
  pool: Pool;
  close(): Promise<void>;
}

/**
 * One pg Pool + Drizzle instance per process (manual DI, ADR13): the app factory receives it,
 * tests create one per file against their cloned database.
 */
export function createDatabase(connectionString: string): DatabaseHandle {
  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool, schema });
  return {
    db,
    pool,
    close: () => pool.end(),
  };
}
