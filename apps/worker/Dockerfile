# syntax=docker/dockerfile:1
#
# Same Turborepo-prune pattern as apps/api/Dockerfile — see that file's
# header for the rationale. NOT built/tested in this environment (no
# Docker engine installed here).

FROM node:22-alpine AS base
RUN corepack enable
RUN npm install -g turbo@2.10.12

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @sayan-sentinel/worker --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# See apps/api/Dockerfile's comment on this line — turbo prune doesn't
# carry the root tsconfig every package extends, confirmed by a real
# failed build, not guessed at.
COPY tsconfig.base.json ./tsconfig.base.json
RUN pnpm turbo run build --filter=@sayan-sentinel/worker...

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 sentinel && adduser --system --uid 1001 sentinel
COPY --from=installer --chown=sentinel:sentinel /app .
USER sentinel
ENV NODE_ENV=production
CMD ["node", "apps/worker/dist/main.js"]
