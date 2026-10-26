# syntax=docker/dockerfile:1

# ─── Build ──────────────────────────────────────────────────────────────────
# One stage builds both workspaces. The lockfile is copied before the source so
# editing Vue components does not invalidate the dependency layer.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ─── Runtime ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    SERVE_CLIENT=true

# Only the API's production dependencies — no Vue, Vite, or test tooling.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci --omit=dev --workspace server --include-workspace-root=false --no-audit --no-fund \
    && npm cache clean --force

# server/dist/index.js resolves the Vue build at ../client/dist.
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/client/dist ./client/dist

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/dist/index.js"]
