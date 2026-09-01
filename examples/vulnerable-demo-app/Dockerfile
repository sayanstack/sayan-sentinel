# syntax=docker/dockerfile:1
#
# Standalone build — this fixture is deliberately excluded from the pnpm
# workspace (see the root package.json), so this is a plain single-stage
# npm build, not the turbo-prune pattern the real apps' Dockerfiles use.
#
# NOT built/tested in this environment — no Docker engine is installed
# here (see docs/implementation-plan.md).

FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
RUN addgroup --system --gid 1001 sentinel && adduser --system --uid 1001 sentinel
USER sentinel
ENV NODE_ENV=production
EXPOSE 4100
CMD ["node", "src/app.js"]
