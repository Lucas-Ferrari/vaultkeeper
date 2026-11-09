# Deployment and operations

Single VPS, Docker Compose (design 14). Four services on one internal network:

| Service    | Image                       | Role                                                                                                                       |
| ---------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `caddy`    | `vaultkeeper-web` (Caddy 2) | TLS (Let's Encrypt), serves the PWA, proxies `/api`, `/media`, `/healthz`. The ONLY service with published ports (80/443). |
| `api`      | `vaultkeeper-api` (Node 22) | Hono API + Better Auth. Catalog images live in the `media` volume (`/data/media`).                                         |
| `migrate`  | `vaultkeeper-api`           | One-shot on every `up`: migrations, then the idempotent catalog seed. `api` starts only after it exits 0.                  |
| `postgres` | `postgres:17-alpine`        | Data in the `pgdata` volume.                                                                                               |

Volumes: `pgdata`, `media`, `caddy_data` (certificates), `caddy_config`. Recreating containers never
loses data; `docker compose down -v` does.

The API image runs the TypeScript sources with `tsx` (a production dependency) rather than a
bundle, so `src/db/migrations` and `seed/` ship in the image at the same relative paths as in dev.

## Client IP and rate limiting

Caddy overwrites `X-Forwarded-For` (and sets `X-Real-IP`) with the real client address. Better Auth
reads `X-Forwarded-For` for its rate limiter. Because the API port is never published, the only way
to reach it is through Caddy, so a client cannot spoof the header. Do NOT publish `api:3000`.

## Environment

Copy `.env.example` to `.env` on the server and set at least:

| Variable                                                      | Notes                                                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `DOMAIN`                                                      | Public hostname; DNS A/AAAA must point at the VPS before the first `up`.                                                         |
| `POSTGRES_PASSWORD`                                           | Strong random value.                                                                                                             |
| `BETTER_AUTH_SECRET`                                          | `openssl rand -base64 48` (>= 32 chars). Changing it signs everyone out.                                                         |
| `GOOGLE_CLIENT_ID/SECRET`, `DISCORD_CLIENT_ID/SECRET`         | Optional, each pair all-or-nothing. Callback URLs: `https://<DOMAIN>/api/auth/callback/google` and `/api/auth/callback/discord`. |
| `COMPOSE_PROJECT_NAME`                                        | Uncomment as `vaultkeeper` so the ops scripts find the volumes.                                                                  |
| `BACKUP_DIR`, `BACKUP_RETENTION_DAYS`                         | Backup location and pruning (default `./backups`, 14 days).                                                                      |
| `UPLOAD_MAX_BYTES`, `CSV_MAX_BYTES`, `LOG_LEVEL`, `IMAGE_TAG` | Optional.                                                                                                                        |

Compose fixes `NODE_ENV=production`, `MEDIA_DIR=/data/media`, `PUBLIC_URL=https://${DOMAIN}` and
`DATABASE_URL` (pointing at the `postgres` service).

## First deploy

```sh
git clone <repo> vaultkeeper && cd vaultkeeper
cp .env.example .env && $EDITOR .env
docker compose up -d --build --wait
docker compose exec api vk promote-admin you@example.com   # after signing up in the browser
```

## Deploy an update

```sh
ops/deploy.sh --dry-run   # prints the steps
ops/deploy.sh             # backup -> tag :previous -> git pull -> build -> up -d
```

### Rollback

1. `docker tag vaultkeeper-api:previous vaultkeeper-api:latest` (same for `vaultkeeper-web`).
2. If the failed release ran a migration, restore the pre-deploy backup: `ops/restore.sh <STAMP>`.
3. `docker compose up -d --no-build`.

## Admin CLI

Inside the api container the operator CLI is `vk`:

```sh
docker compose exec api vk                       # usage
docker compose exec api vk promote-admin <email> # bootstrap the first admin
docker compose exec api vk demote-admin <email>
docker compose exec api vk reset-password <email> # there is no email reset: users ask an admin
docker compose exec api vk seed                  # re-run the catalog seed (idempotent)
```

## Backups

```sh
ops/backup.sh                 # pg_dump -Fc + media tarball into $BACKUP_DIR, prunes old ones
ops/restore.sh [STAMP]        # DESTRUCTIVE: stops api, pg_restore --clean, replaces media, starts api
```

Run `ops/backup.sh` from cron (e.g. daily) and copy `$BACKUP_DIR` OFF the server (rsync/rclone to
another host or object storage). A backup that lives only on the VPS is not a backup.

## Local smoke test

`ops/smoke.sh` brings up a throwaway `vk-smoke` stack with `DOMAIN=localhost` (Caddy local CA),
checks HTTPS health, the HTTP->HTTPS redirect, that only Caddy publishes ports, migrations + seed,
an idempotent redeploy, persistence across container recreation, and a full backup -> wipe ->
restore drill. It needs ports 80/443 free and removes everything on exit.

## VPS verification checklist (manual, pending)

Run once on the real server after the first deploy:

- [ ] `https://<DOMAIN>/healthz` returns 200 with a valid Let's Encrypt certificate.
- [ ] `http://<DOMAIN>` redirects to HTTPS.
- [ ] `nmap`/`ss -tlnp` shows only 80 and 443 open (plus SSH); 3000 and 5432 are NOT reachable.
- [ ] Sign up, `vk promote-admin`, upload a catalog image, add stock.
- [ ] Rate limiting sees the real IP: repeated failed sign-ins from one client get 429 while another
      client is unaffected; API logs show client IPs, not Caddy's.
- [ ] Google/Discord sign-in work with the production callback URLs (if configured).
- [ ] The PWA installs from the browser and opens offline with the offline banner.
- [ ] `ops/deploy.sh` runs end to end; a pre-deploy backup appears in `$BACKUP_DIR`.
- [ ] Restore drill on the server (`ops/restore.sh`) during a maintenance window.
- [ ] Cron backup + offsite copy configured and one copy verified off the server.
- [ ] Catalog search p95 sanity check on the VPS (R-SRCH-3).
