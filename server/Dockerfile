# syntax=docker/dockerfile:1
#
# Server image only — the client is a static build deployed separately
# (Vercel/Netlify/Cloudflare Pages, see the root README's deployment guide).
# Build from the REPO ROOT so this can reach shared/ and the root lockfile:
#   docker build -f server/Dockerfile -t synccode-server .
#
# Honest caveat: this Dockerfile has been reasoned through and the
# underlying npm install/build/boot sequence verified outside Docker (no
# Docker daemon is available in the environment that built this project) —
# it has not actually been through `docker build`/`docker run` for real.
# Test that yourself before trusting it in production.

# ---- builder: compiles shared + server (TypeScript, including node-pty's
# native addon) ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# node-pty falls back to compiling from source if no prebuilt binary matches
# this exact platform/Node ABI.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY . .
RUN npm ci --workspace=shared --workspace=server
RUN npm run build -w shared && npm run build -w server

# ---- runtime: production-only install + compiled output ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# python3/make/g++ are used once below to install node-pty's production
# dependency, then removed — they don't belong in the final image. bash,
# the rest of python3, and git stay: they're runtime tools for the shared
# terminal (M5), not build tooling. Add whatever else your students need
# here (a JDK, Go, Rust, …) — "if those tools exist on the server" (per the
# spec) means exactly this list.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ bash python3-pip git \
    && rm -rf /var/lib/apt/lists/*

# A dedicated non-root user. The server process itself runs as this user,
# which already satisfies "run as a non-root user" for the terminal's child
# process without needing TERMINAL_UID/GID (see terminalManager.ts) — those
# env vars are for the rarer case of wanting the shell to run as a *more*
# restricted user than the server process itself.
RUN groupadd --system --gid 10001 synccode \
    && useradd --system --uid 10001 --gid synccode --home-dir /app --shell /usr/sbin/nologin synccode

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev --workspace=shared --workspace=server \
    && apt-get purge -y --auto-remove make g++ \
    && rm -rf /var/lib/apt/lists/* /root/.npm

COPY --from=builder /app/shared/dist shared/dist
COPY --from=builder /app/server/dist server/dist

# The room-workspace root (see server/src/services/workspaceFs.ts) — created
# ahead of time so it's owned by the non-root user, not root.
RUN mkdir -p /app/server/workspaces && chown -R synccode:synccode /app

USER synccode
WORKDIR /app/server
EXPOSE 4000
CMD ["node", "dist/index.js"]
