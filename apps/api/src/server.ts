import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createAuth } from "./auth/auth";
import { loadEnv } from "./config/env";
import { createDatabase } from "./db/client";
import { createLocalDiskAdapter } from "./storage/local-disk-adapter";

const env = loadEnv();
const database = createDatabase(env.DATABASE_URL);
const auth = createAuth({ db: database.db, env });
const storage = createLocalDiskAdapter(env.MEDIA_DIR);
const app = createApp({
  auth,
  db: database.db,
  storage,
  limits: { uploadMaxBytes: env.UPLOAD_MAX_BYTES, csvMaxBytes: env.CSV_MAX_BYTES },
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.info(`vaultkeeper api listening on http://localhost:${info.port} (${env.NODE_ENV})`);
});
