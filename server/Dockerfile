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

# Language toolchains for the shared terminal — "if those tools exist on the
# server" (per the spec) means exactly this list. Node.js/npm come with the
# base image. Trim lines you don't need to shrink the image (Rust and the JDK
# are the biggest).
#   C/C++  : gcc, g++, make, gdb, cmake        Python : python3, pip, venv
#   Java   : OpenJDK 17 (javac, java)          Go     : go
#   Rust   : rustc, cargo                      Ruby   : ruby, gem
#   PHP    : php                               SQLite : sqlite3
# plus everyday shell tools (git, curl, wget, nano, vim, less, zip, …).
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash ca-certificates git curl wget nano vim-tiny less procps file tree \
      zip unzip xz-utils jq sqlite3 \
      build-essential gdb cmake pkg-config \
      python3 python3-pip python3-venv python3-dev python-is-python3 \
      default-jdk-headless \
      golang-go \
      rustc cargo \
      ruby-full \
      php-cli \
    && rm -rf /var/lib/apt/lists/*
# (pip/npm/cargo/go install locations for the terminal are set per shell in
# server/src/services/terminalManager.ts.)

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
# make/g++ stay installed: they're student tools now, not just build tooling.
RUN npm ci --omit=dev --workspace=shared --workspace=server \
    && rm -rf /root/.npm

COPY --from=builder /app/shared/dist shared/dist
COPY --from=builder /app/server/dist server/dist

# The room-workspace root (see server/src/services/workspaceFs.ts) — created
# ahead of time so it's owned by the non-root user, not root.
RUN mkdir -p /app/server/workspaces && chown -R synccode:synccode /app

USER synccode
WORKDIR /app/server
EXPOSE 4000
CMD ["node", "dist/index.js"]
