# vaultkeeper

This app tracks virtual assets and let's you announce for sale on the platforms marketplace

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
| `pnpm e2e`       | Playwright; starts the API and Vite dev servers itself (no production build)   |
| `pnpm typecheck` | `tsc --noEmit` in every package (Turborepo)                                    |

First Playwright run on a machine: `pnpm --filter @vaultkeeper/web exec playwright install --only-shell chromium`.

No CI provider is configured yet; `pnpm check` and `pnpm e2e` are the gates to run before pushing.
