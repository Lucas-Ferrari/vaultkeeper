# vaultkeeper

Vaultkeeper tracks your MU Online items across game accounts, vaults and characters, and values
them in MC/MP from an admin-maintained catalog. It is an installable PWA (works offline read-only).

> **Marketplace: FUTURE.** Listing items for sale is not part of the MVP and stays out until
> MegaMu's terms of service are confirmed to allow it. There are no marketplace routes.

**Not affiliated with Webzen or MEGADEV.** See [NOTICE](NOTICE) for third-party data (OpenMU).

## Deployment and operations

Production runs on one VPS with Docker Compose (Caddy + API + Postgres 17). Full guide, env vars,
rollback and the VPS checklist: [docs/deployment.md](docs/deployment.md).

```sh
cp .env.example .env && $EDITOR .env      # DOMAIN, POSTGRES_PASSWORD, BETTER_AUTH_SECRET, OAuth
docker compose up -d --build --wait       # first deploy
ops/deploy.sh                             # later deploys: backup first, then pull, build, up
ops/backup.sh / ops/restore.sh [STAMP]    # pg_dump + catalog images; copy backups offsite
ops/smoke.sh                              # local throwaway stack: health, redirect, restore drill
```

OAuth callback URLs: `https://<DOMAIN>/api/auth/callback/google` and
`https://<DOMAIN>/api/auth/callback/discord`.

### Admin CLI

```sh
docker compose exec api vk promote-admin <email>   # bootstrap the first admin (sign up first)
docker compose exec api vk demote-admin <email>
docker compose exec api vk reset-password <email> [--password-stdin]
docker compose exec api vk seed [--file <seed.json>]
```

There is no email-based password reset: users who forget their password ask an admin, who runs
`reset-password` (prints a generated password unless `--password-stdin` is given). In dev the same
commands run with `pnpm --filter @vaultkeeper/api cli <command>`.

## Development

Requirements: Node.js >= 22.13, pnpm 9 (`corepack enable`), and **Docker** (running).

Docker is required for:

- `pnpm test`: the `api-int` suite starts `postgres:17-alpine` with Testcontainers. Without a
  reachable Docker socket, point it at any Postgres 17 server instead (for example the dev compose
  one): `VK_TEST_DATABASE_URL=postgres://vaultkeeper:vaultkeeper@localhost:5432/vaultkeeper pnpm test`.
- Local dev and `pnpm e2e`: the dev database, `docker compose -f docker-compose.dev.yml up -d --wait`.

```sh
pnpm install
cp .env.example .env                            # dev placeholders
docker compose -f docker-compose.dev.yml up -d --wait
pnpm --filter @vaultkeeper/api dev              # API on http://localhost:3000
pnpm --filter @vaultkeeper/web dev              # web on http://localhost:5173 (proxies /api, /media)
```

| Command          | What it runs                                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| `pnpm check`     | The full local gate: `lint` + `format:check` + `typecheck` + `test`            |
| `pnpm test`      | All Vitest projects (unit, `api-int` on real Postgres, web with jsdom and MSW) |
| `pnpm test:int`  | Only the `api-int` project                                                     |
| `pnpm e2e`       | Playwright; starts the API, the Vite dev server and a `vite build` + preview   |
| `pnpm typecheck` | `tsc --noEmit` in every package (Turborepo)                                    |

First Playwright run on a machine: `pnpm --filter @vaultkeeper/web exec playwright install --only-shell chromium`.

The Playwright `preview` project (`e2e/specs/pwa.spec.ts`) runs against the production bundle:
manifest, service worker and the offline app shell. Lighthouse CI:
`pnpm --filter @vaultkeeper/web lighthouse` (builds, then `lhci autorun`; needs a local Chrome or
`CHROME_PATH`).

No CI provider is configured yet; `pnpm check` and `pnpm e2e` are the gates to run before pushing.
