# Game-server Docker image. Build context = monorepo root so the workspace
# packages (@quiz/db, @quiz/shared) resolve via pnpm-workspace.yaml.
#
# We deliberately pick `node:20-slim` over alpine: Prisma's generated client
# ships glibc binaries by default, and the alpine (musl) build path is
# fiddly. slim is small enough.

FROM node:20-slim

# pnpm via corepack — pinned to match packageManager field in package.json.
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Prisma's schema engine binary depends on openssl + ca-certificates.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the whole monorepo. .dockerignore keeps secrets / node_modules out.
COPY . .

# Install workspace deps.
RUN pnpm install --frozen-lockfile

# Generate Prisma client. Done as an explicit step (not a postinstall hook)
# so the install works the same whether the wrapping runtime is pnpm or
# npm — important for Fly's auto-builders.
RUN pnpm --filter @quiz/db exec prisma generate

EXPOSE 2567

WORKDIR /app/apps/game

# tsx runs TypeScript directly — no separate build step needed for the
# game server. If you ever want a precompiled image, swap to `pnpm build`
# + `node dist/index.js`.
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
