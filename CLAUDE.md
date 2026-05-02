# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Next.js dev server on http://localhost:3000
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — run ESLint (uses `eslint-config-next` core-web-vitals + typescript)
- `npx prisma generate` — regenerate the Prisma client into [app/generated/prisma/](app/generated/prisma/) (this directory is git-ignored)
- `npx prisma migrate dev` — apply migrations against `DIRECT_URL` (see [prisma.config.ts](prisma.config.ts))
- `npx prisma db seed` — runs `tsx prisma/seed.ts` (note: a `seed.ts` does not currently exist)

There is no test runner configured.

## Environment

- `DATABASE_URL` — pooled Postgres connection used by the runtime Prisma client (via `@prisma/adapter-pg` in [app/lib/prisma.ts](app/lib/prisma.ts))
- `DIRECT_URL` — direct Postgres connection used by Prisma CLI for migrations
- `SESSION_SECRET` — HMAC key for JWT session cookies ([app/lib/session.ts](app/lib/session.ts))
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project credentials. Supabase is used **only for Realtime** (Postgres change subscriptions); all reads/writes go through Prisma against the same Postgres database.

## Architecture

This is a Next.js 16 App Router project (React 19, Tailwind v4) implementing a Risk-style multiplayer quiz game on a map of Europe. It is the author's diploma project (`package.json` name: `diploma`).

### Data flow: Prisma writes, Supabase Realtime fans out

The same Postgres database is accessed two ways:

1. **Server-side mutations** go through Prisma server actions (`"use server"` files like [app/match/[id]/actions.ts](app/match/[id]/actions.ts), [app/lobby/[id]/actions.ts](app/lobby/[id]/actions.ts), [app/dashboard/actions.ts](app/dashboard/actions.ts)) and route handlers under [app/api/](app/api/).
2. **Client components subscribe to `postgres_changes`** via Supabase Realtime channels keyed per session — e.g. `map-${sessionId}`, `game-${sessionId}`, `questions-${sessionId}`, `phase-${sessionId}`. When a server action updates a row (e.g. `MatchCountry`, `GameSession`, `MatchQuestion`), all clients receive the change and refetch via the API routes.

This means: **schema/table/column renames break realtime filters silently** — the filter strings reference exact table names like `MatchCountry` and `gameSessionId`. After Prisma schema changes, audit every Supabase channel subscription.

### Game state machine

`GameSession.stage` progresses `capitals` → `expand` → `war`. Stage transitions are computed in [app/match/[id]/actions.ts](app/match/[id]/actions.ts) (`advanceTurnAndStage`) — and **also recomputed defensively in [app/match/[id]/page.tsx](app/match/[id]/page.tsx)** before render. Both code paths must agree on transition conditions.

- **capitals**: each player picks one capital in `turnIndex` order. Action: `claimCapital`.
- **expand**: a question is broadcast (`MatchQuestion`, 10s expiry). All players submit a numeric answer; `resolveQuestion` ranks by `|answer - correctAnswer|` and assigns `pickOrder` (1st place picks 2 territories with 3+ players, 2nd picks 1; with 2 players only 1st picks 1). Players then claim free *neighbors* of their existing territories. If a pick isn't made within 15s, `startPickTimer` auto-picks a random free neighbor. Action: `claimTerritory`.
- **war**: players attack neighbor enemy territories (`WarAttack` + `WarQuestion` with multiple-choice options). Both attacker and defender answer; `resolveAttack` settles ownership/armies. `GameSession.currentAttackId` enforces that only one attack can be live per session.

`GameSession.pickOrder` is the **queue of upcoming pickers** (a `String[]` of `PlayerInGame.id`s), not a fixed turn rotation — `pickOrder[0]` is whoever must pick next, and `capture` shifts the head after each pick.

### Map data

`CountryTemplate` is a static seed table (id, name, neighbors `Int[]`, `svgId`). When a game starts, [app/lobby/[id]/actions.ts](app/lobby/[id]/actions.ts):`initializeMap` clones every template into `MatchCountry` rows for that session. Neighbor adjacency is resolved by joining `MatchCountry → CountryTemplate.neighbors` (see `getFreeNeighbors` / `getEnemyNeighbors`).

The frontend SVG map ([app/match/[id]/EuropeMap.tsx](app/match/[id]/EuropeMap.tsx)) maps countries by `template.svgId`; server actions look templates up by `svgId` to translate clicks into `MatchCountry` updates.

### Auth

Custom JWT sessions, not Supabase Auth. [app/lib/session.ts](app/lib/session.ts) signs/verifies a `session` cookie with `jose`; [proxy.ts](proxy.ts) is the Next middleware that gates `/dashboard` and bounces logged-in users away from `/login`/`/register`. Server actions/pages call [app/lib/auth.ts](app/lib/auth.ts):`getProfile`/`getProfileSafe` to load the `PlayerProfile` for the current cookie.

> Note: the middleware file is named `proxy.ts` (not `middleware.ts`). Next.js 16 supports both names.

### Prisma client location

The generator outputs to [app/generated/prisma/](app/generated/prisma/) (configured in [prisma/schema.prisma](prisma/schema.prisma)), not `node_modules/@prisma/client`. Imports go through [app/lib/prisma.ts](app/lib/prisma.ts), which wires the `@prisma/adapter-pg` driver adapter. The generated directory is git-ignored — `npx prisma generate` must be run after fresh clone.

### Path aliases

`@/*` maps to the repo root, so server-side imports use `@/app/lib/...`.
