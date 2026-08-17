# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Architecture overview

The project is a **pnpm monorepo** with a split between Next.js (HTTP/UI) and
a Colyseus authoritative game server (live match WebSocket). Postgres is the
single source of truth for persistence, accessed by both apps via a shared
Prisma client.

```
quiz-game/
├── apps/
│   ├── web/         Next.js 16 (auth, lobby, profile, settings,
│   │                analytics, match — connects to Colyseus)
│   └── game/        Colyseus 0.16 game server (authoritative state)
├── packages/
│   ├── db/          Shared Prisma client + schema
│   └── shared/      Pure game logic, schemas, JWT helper
```

The live match UI lives at `apps/web/app/match/[id]` and talks to the
Colyseus game server (the old Supabase-Realtime match flow has been
fully removed).

## Commands

Run from repo root:
- `pnpm dev:web` — Next.js dev on http://localhost:3000
- `pnpm dev:game` — Colyseus dev on ws://localhost:2567
- `pnpm typecheck` — TypeScript across all packages
- `pnpm test` — vitest (apps/web has 120 tests for pure helpers)
- `pnpm db:push` — push schema changes to Postgres
- `pnpm db:generate` — regenerate Prisma client into `packages/db/generated/`
- `pnpm db:studio` — open Prisma Studio

## Environment

Root `.env` / `.env.local` (symlinked into `apps/web/` for Next.js auto-load):
- `DATABASE_URL` — pooled Postgres connection (runtime)
- `DIRECT_URL` — direct Postgres connection (Prisma CLI for migrations)
- `SESSION_SECRET` — HMAC key for JWT session cookies. **Must be the same
  on Next.js and Colyseus** (both verify via `verifyJwt` in
  `@quiz/shared/auth`)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — used by the
  lobby for player-list realtime sync. Live match no longer touches Supabase
  Realtime — Colyseus owns it
- `NEXT_PUBLIC_GAME_SERVER_URL` — WebSocket URL of the Colyseus server
  (defaults to `ws://localhost:2567` in dev). Set to `wss://...` in prod
- `ADMIN_EMAILS` — comma-separated emails allowed to view `/analytics`

## Architecture details

### Live match — Colyseus authoritative

`apps/game/src/rooms/MatchRoom.ts` owns the entire game state in memory.
Lifecycle:

1. **onCreate(options)** — receives `sessionId`, hydrates `MatchState` from
   Postgres (PlayerInGame rows + their MatchChoice → schema players;
   CountryTemplate rows → schema countries). The `MatchCountry` Postgres
   table is no longer touched during the live match.
2. **onAuth(client, options)** — verifies JWT cookie via `@quiz/shared`,
   confirms `PlayerInGame` exists for this session, rejects otherwise.
3. **Stage handlers** mutate state in place. @colyseus/schema diffs and
   broadcasts only the changes to all connected clients.
4. **At game_over** — writes a single `MatchSnapshot` row with finalState
   + telemetry as JSON. Updates PlayerProfile stats (ELO, XP, level)
   via the same pure helpers as before.

Stages: `capitals → expand → war → ended`. Same rules as the legacy code,
but driven by a single tick interval (250ms) instead of dozens of
client-side timers + atomic SQL claims. No race conditions — the room
runs single-threaded.

### Frontend — Zustand bridge

`apps/web/app/lib/gameStore.ts` wraps the Colyseus Room in a Zustand store
that mirrors the synced state as a plain JS object. React components
subscribe via narrow selectors (`useStage`, `useCountries`, `usePlayers`,
`useActiveQuestion`, etc.) — no whole-tree rerenders on every state tick.

Match UI lives in `apps/web/app/match/[id]/`:
- `page.tsx` — server component, verifies cookie + PlayerInGame, passes
  JWT + sessionId + myPlayerId to MatchClient
- `MatchClient.tsx` — connects on mount, renders skeleton + 3-pane layout
- `MapPanel.tsx` — SVG map (paths in `apps/web/app/lib/europeSvg.ts`),
  click → store action
- `ActionPanel.tsx` — questions / war attacks / results banner
- `PlayerPanel.tsx` — sidebar with stats, capital HP, turn highlight

### Persistence — single MatchSnapshot row per game

`MatchSnapshot { sessionId, finalState: Json, telemetry: Json, duration }`.
The legacy granular tables (`MatchCountry`, `MatchEvent`, `MatchQuestion`,
`PlayerAnswer`, `WarAttack`, `WarAnswer`) are not written to during the live
match. They still exist in the schema for compatibility but should be
considered deprecated.

`MatchSnapshot.telemetry` shape:
- `numericAnswers[]` — per Expand answer: value, diff, timeMs,
  firstInputAtMs, inputChangeCount, category
- `warAnswers[]` — per War MC answer: isCorrect, submittedAtMs, category
- `capitalPicks[]`, `territoryPicks[]`, `attacks[]` — basic event log

`/analytics` reads aggregates from MatchSnapshot.telemetry across the most
recent 200 completed matches.

### Auth (unchanged)

Custom JWT in cookie, signed with `SESSION_SECRET` via `jose`. Next.js
middleware `proxy.ts` gates `/dashboard`, `/settings`, `/analytics`.
Colyseus `onAuth` verifies the same token.

### Path aliases

- `@/*` → `apps/web/*`
- `@quiz/db` → `packages/db/src/index.ts`
- `@quiz/shared`, `@quiz/shared/schemas`, etc → `packages/shared/src/...`

### Deploy

- Vercel for `apps/web` (root: `apps/web`)
- Railway/Fly.io for `apps/game` (long-running Node process — Vercel
  serverless can't host WebSockets)
- Supabase Postgres for both

Same `SESSION_SECRET` env var must be configured on both Vercel and
Railway. `NEXT_PUBLIC_GAME_SERVER_URL` on Vercel points at the Railway
WebSocket URL.
