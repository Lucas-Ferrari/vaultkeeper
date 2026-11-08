import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createAuth } from "./auth/auth";
import { loadEnv } from "./config/env";
import { createDatabase } from "./db/client";

const env = loadEnv();
const database = createDatabase(env.DATABASE_URL);
const auth = createAuth({ db: database.db, env });
const app = createApp({ auth, db: database.db });

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.info(`vaultkeeper api listening on http://localhost:${info.port} (${env.NODE_ENV})`);
});
