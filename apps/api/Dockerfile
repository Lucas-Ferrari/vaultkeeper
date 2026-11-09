# syntax=docker/dockerfile:1
# API image (task 7.1). Build from the REPO ROOT: docker build -f apps/api/Dockerfile .
# Runs the TypeScript sources with tsx (a production dependency) instead of a bundle: the source
# layout is kept, so src/db/migrations and seed/ resolve exactly as in dev (see README, Deployment).

FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @vaultkeeper/api...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# Only the api and the workspace packages it depends on, production deps only.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm --filter @vaultkeeper/api deploy --prod /out \
 && rm -rf /out/test && find /out/src -name "*.test.ts" -delete

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    MEDIA_DIR=/data/media
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Operator CLI: `docker compose exec api vk <command>` (promote-admin, reset-password, seed, ...).
RUN printf '#!/bin/sh\nexec node --import tsx /app/src/cli/index.ts "$@"\n' > /usr/local/bin/vk \
 && chmod +x /usr/local/bin/vk \
 && mkdir -p /data/media && chown -R node:node /data
USER node
VOLUME ["/data/media"]
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "--import", "tsx", "src/server.ts"]
