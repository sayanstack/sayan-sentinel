# syntax=docker/dockerfile:1
#
# Multi-stage build using Turborepo's `prune` — the current recommended
# pattern for containerizing one app out of a pnpm+Turborepo monorepo:
# prune extracts only the workspace packages @sayan-sentinel/api actually
# depends on (plus a pruned lockfile), so the install stage doesn't need
# the whole repo.
#
# NOT built/tested in this environment — no Docker engine is installed
# here (see docs/implementation-plan.md). Written against Turborepo's
# documented Docker guide; verify with `docker build` before relying on it.

FROM node:22-alpine AS base
RUN corepack enable
RUN npm install -g turbo@2.10.12

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @sayan-sentinel/api --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# `turbo prune --docker` traces the package.json/import dependency graph,
# not tsconfig `extends` targets — the root tsconfig every package extends
# doesn't survive the prune on its own. Verified by an actual failed build
# (`tsc` error TS5083: Cannot read file '/app/tsconfig.base.json') the
# first time this Dockerfile was really built, not guessed at.
COPY tsconfig.base.json ./tsconfig.base.json
RUN pnpm turbo run build --filter=@sayan-sentinel/api...

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 sentinel && adduser --system --uid 1001 sentinel
COPY --from=installer --chown=sentinel:sentinel /app .
USER sentinel
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
