# Migration plan — переезд на Colyseus + Zustand

Документ-roadmap. Завтра открываем и идём по фазам сверху вниз.

## TL;DR

- **Frontend:** остаётся Next.js. Добавляем Zustand для state матча.
- **Backend для матча:** новый Colyseus-сервер (отдельный процесс).
- **Backend для остального** (auth, profile, lobby, settings, analytics): остаётся Next.js.
- **БД:** та же Postgres/Supabase. Перестраиваем схему — выкидываем live-таблицы, добавляем `MatchSnapshot`.
- **Хостинг:** Vercel + Railway (или Fly.io) + Supabase.
- **Объём:** ~10 рабочих дней при сосредоточенной работе.

---

## Архитектура

```
┌────────────────────── БРАУЗЕР ──────────────────────┐
│  HTML страницы          ←→     Live матч             │
│  (lobby, profile, ...)        (EuropeMap, etc)       │
└──────┬──────────────────────────────────┬───────────┘
       │ HTTP                             │ WebSocket
       ↓                                  ↓
┌──────────────────────┐         ┌─────────────────────┐
│   Next.js (Vercel)   │         │  Colyseus (Railway) │
│  Server actions      │         │  Game rooms         │
│  Server components   │         │  In-memory state    │
│  API routes (auth)   │         │  Pure game loop     │
└─────────┬────────────┘         └──────────┬──────────┘
          │           Prisma                │
          ↓                                  ↓
       ┌──────────────────────────────────────┐
       │     Postgres (Supabase)              │
       └──────────────────────────────────────┘
```

---

## Phase 0 — Подготовка (день 1, утро)

### 0.1. Создать ветку
```bash
git checkout -b colyseus-migration
```

### 0.2. Превратить проект в monorepo через pnpm workspaces

Структура которую делаем:
```
quiz-game/
├── apps/
│   ├── web/         ← существующий Next.js (переносим)
│   └── game/        ← новый Colyseus сервер
├── packages/
│   ├── db/          ← Prisma schema + generated client
│   └── shared/      ← types, schemas, pure gameLogic
├── package.json     ← root workspace manifest
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Шаги:
1. `mkdir -p apps/web apps/game packages/db packages/shared`
2. `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - "apps/*"
     - "packages/*"
   ```
3. Перенести текущий код:
   - `app/`, `public/`, `proxy.ts`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `tsconfig.json`, `package.json` → `apps/web/`
   - `prisma/` → `packages/db/`
   - `tests/` → пока к `apps/web/` (потом разнесём)
4. Перенести `app/match/[id]/gameLogic.ts` (pure helpers) → `packages/shared/src/gameLogic.ts`. То же для `app/lib/matchChoices.ts`. Эти модули будут использоваться **и в Next.js, и в Colyseus**.
5. Создать root `package.json` с workspaces, общие devDeps (`typescript`, `vitest`).

### 0.3. Проверить что web ещё работает
```bash
cd apps/web && pnpm dev
```
Открыть localhost:3000 — должно быть ровно как сейчас. Это контрольная точка.

---

## Phase 1 — Colyseus skeleton (день 1, вторая половина + день 2 утро)

### 1.1. Поставить Colyseus
```bash
cd apps/game
pnpm init
pnpm add colyseus @colyseus/schema
pnpm add -D typescript @types/node tsx
```

### 1.2. Минимальный сервер
`apps/game/src/index.ts`:
```ts
import { Server } from "colyseus";
import { createServer } from "http";
import { MatchRoom } from "./rooms/MatchRoom";

const port = Number(process.env.PORT) || 2567;
const httpServer = createServer();
const gameServer = new Server({ server: httpServer });

gameServer.define("match", MatchRoom);
gameServer.listen(port);
console.log(`[colyseus] listening on :${port}`);
```

### 1.3. Объявить GameState через @colyseus/schema

`packages/shared/src/schemas/MatchState.ts` (общий между сервером и клиентом):
```ts
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Country extends Schema {
  @type("string") id: string;
  @type("string") svgId: string;
  @type("string") ownerId: string | null;
  @type("boolean") isCapital = false;
  @type("number") armies = 1;
  @type("number") maxArmies = 1;
  @type("number") points = 200;
}

export class Player extends Schema {
  @type("string") id: string;
  @type("string") nickname: string;
  // ...
}

export class MatchState extends Schema {
  @type("string") stage = "capitals";
  @type("number") turnIndex = 0;
  @type(["string"]) pickOrder = new ArraySchema<string>();
  @type({ map: Country }) countries = new MapSchema<Country>();
  @type({ map: Player }) players = new MapSchema<Player>();
  // ... activeQuestion, activeAttack, deadlines ...
}
```

### 1.4. Минимальный MatchRoom
`apps/game/src/rooms/MatchRoom.ts`:
```ts
import { Room, Client } from "colyseus";
import { MatchState } from "@quiz/shared/schemas/MatchState";

export class MatchRoom extends Room<MatchState> {
  onCreate() {
    this.setState(new MatchState());
    this.onMessage("ping", (client) => {
      client.send("pong", { ts: Date.now() });
    });
  }

  async onAuth(client: Client, options: { jwt: string }) {
    // Здесь декодируем JWT тем же `jose` что в Next.js
    return { userId: "stub" };
  }

  onJoin(client: Client) {
    console.log(`[match] ${client.sessionId} joined`);
  }

  onLeave(client: Client) {
    console.log(`[match] ${client.sessionId} left`);
  }
}
```

### 1.5. Запуск + sanity check
```bash
cd apps/game && pnpm tsx src/index.ts
```
Должен подняться на :2567. Из браузера консоли:
```js
const c = new Colyseus.Client("ws://localhost:2567");
const room = await c.joinOrCreate("match");
room.onMessage("pong", console.log);
room.send("ping");
```
Получить pong — checkpoint.

---

## Phase 2 — Подключаем фронтенд (день 2 вторая половина)

### 2.1. Поставить клиент
```bash
cd apps/web
pnpm add colyseus.js zustand
```

### 2.2. Zustand store-обёртка над Colyseus
`apps/web/lib/gameStore.ts`:
```ts
import { create } from "zustand";
import { Client, Room } from "colyseus.js";
import type { MatchState } from "@quiz/shared/schemas/MatchState";

interface GameStore {
  room: Room<MatchState> | null;
  // mirror полей state как primitive (ререндер только на изменение)
  stage: string;
  turnIndex: number;
  pickOrder: string[];
  // ...

  connect: (sessionId: string, jwt: string) => Promise<void>;
  disconnect: () => void;
}

const SERVER = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";

export const useGameStore = create<GameStore>((set, get) => ({
  room: null, stage: "capitals", turnIndex: 0, pickOrder: [],

  async connect(sessionId, jwt) {
    const client = new Client(SERVER);
    const room = await client.joinOrCreate<MatchState>("match", {
      sessionId, jwt,
    });

    room.onStateChange((s) => set({
      stage: s.stage,
      turnIndex: s.turnIndex,
      pickOrder: [...s.pickOrder],
    }));

    set({ room });
  },

  disconnect() { get().room?.leave(); set({ room: null }); },
}));
```

### 2.3. `MatchClient` оборачивает страницу матча
`apps/web/app/match/[id]/MatchClient.tsx`:
```tsx
"use client";
import { useEffect } from "react";
import { useGameStore } from "@/lib/gameStore";

export default function MatchClient({ sessionId, jwt }: Props) {
  const connect = useGameStore((s) => s.connect);
  const disconnect = useGameStore((s) => s.disconnect);

  useEffect(() => {
    connect(sessionId, jwt);
    return () => disconnect();
  }, [sessionId, jwt]);

  return <MatchUI />; // renders existing components, but reading from store
}
```

### 2.4. Replace existing useState'ы в `EuropeMap`, `ActionPanel`, `PlayerPanel`, `StatusBar`, `MatchHeader`, `EventFeed` — теперь читают из `useGameStore` с селекторами.
Удалить ВСЕ `supabase.channel(...)` подписки внутри них.

---

## Phase 3 — Перенос game logic в room handler (дни 3-5)

Это самая большая часть. Берём `apps/web/app/match/[id]/actions.ts` (1300+ строк) и разбираем по событиям Colyseus.

### 3.1. События которые принимает MatchRoom

| Old server action | New Colyseus message |
|-------------------|----------------------|
| `claimCapital(sessionId, svgId, ...)` | `room.send("claim_capital", { svgId, hovered })` |
| `claimTerritory(...)` | `room.send("claim_territory", { svgId, hovered })` |
| `attackTerritory(...)` | `room.send("attack", { countryId, hovered })` |
| `submitAnswer(...)` | `room.send("answer", { value, telemetry })` |
| `submitWarAnswer(...)` | `room.send("war_answer", { option, telemetry })` |
| `submitWarTieBreaker(...)` | `room.send("war_tie", { value })` |
| `setMatchChoice(...)` (в lobby) | остаётся в Next.js (это в лобби, не матче) |
| `forceAuto*` | заменяется room-internal таймерами через `this.clock.setTimeout(...)` |

### 3.2. Game loop в MatchRoom

Архитектура:
```ts
export class MatchRoom extends Room<MatchState> {
  onCreate(options) {
    this.setState(new MatchState());

    this.onMessage("claim_capital", this.handleClaimCapital.bind(this));
    this.onMessage("claim_territory", this.handleClaimTerritory.bind(this));
    // ...

    // Timer для capital pick deadline
    this.clock.setInterval(() => this.tickTimers(), 200);
  }

  private handleClaimCapital(client, msg) {
    const playerId = this.clientToPlayer.get(client.sessionId);
    if (this.state.stage !== "capitals") return;
    if (this.state.players.get(playerId).turnOrder !== this.state.turnIndex) return;

    // Тут pure helper из @quiz/shared — те же алгоритмы что были
    const country = this.state.countries.get(msg.svgId);
    if (!country || country.ownerId) return;
    if (this.playerHasCapital(playerId)) return;

    const params = capitalParamsForChoice(this.playerChoices.get(playerId)?.capital_style);
    country.ownerId = playerId;
    country.isCapital = true;
    country.armies = params.armies;
    country.maxArmies = params.armies;
    country.points = params.points;

    this.advanceTurn();
  }

  // ...
}
```

**Ключевой момент:** game loop в Colyseus single-threaded, никаких race conditions. Атомарные SQL claims, validateSession, polling watchdogs — **выкидываем нафиг**.

### 3.3. Pure helpers — переиспользуем 1:1

Файлы которые перетаскиваем в `packages/shared/src/`:
- `gameLogic.ts` — `computeEloChanges`, `computeXpEarned`, `applyExperience`, `rankAnswers`, `computePickOrder`, `computeTieResult`, `warEndReason`, `winnerByLands`, `attackerWonOutcome`, `territoriesForPlace`, `sanitizeHoverTrail`, `checkSessionInvariants`
- `matchChoices.ts` — `MATCH_CHOICES`, `capitalParamsForChoice`, etc

Эти модули вызываются из MatchRoom без каких-либо изменений. Все 120 тестов остаются.

### 3.4. Persistence — только на game_over

Игра идёт целиком в памяти Colyseus. БД дёргаем ТОЛЬКО:
- `onCreate(options)` — загрузить players/profiles + capital choices из Postgres (по `sessionId`)
- На `game_over` — записать финальный snapshot:
  ```ts
  await prisma.matchSnapshot.create({
    data: {
      sessionId,
      winnerId,
      stage: "ended",
      finalState: this.state.toJSON(),
      telemetry: this.collectedTelemetry,
      duration: Date.now() - this.startedAt,
    },
  });
  await updatePlayerStats(...); // ELO, XP — pure helpers
  ```

### 3.5. Новая таблица в схеме
```prisma
model MatchSnapshot {
  id          String   @id @default(cuid())
  sessionId   String   @unique
  winnerId    String?
  finalState  Json
  telemetry   Json     // все answer times, hovers, choices etc
  duration    Int      // ms
  createdAt   DateTime @default(now())

  session     GameSession @relation(fields: [sessionId], references: [id])
}
```

### 3.6. Что выкидываем из БД
Эти модели больше не нужны (живут только в памяти Colyseus):
- `MatchQuestion` ❌
- `PlayerAnswer` ❌
- `WarAttack` ❌
- `WarAnswer` ❌
- `MatchEvent` ❌ (вместо это writeup в `MatchSnapshot.telemetry`)
- `MatchCountry` ❌ (state в Colyseus, snapshot — в `MatchSnapshot.finalState`)
- `MatchChoice` — переезжает на `PlayerInGame.choicesJson` (одно поле jsonb)

Что остаётся:
- `User`, `PlayerProfile`, `GameSession` (status/createdAt/winnerId), `PlayerInGame` (membership), `CountryTemplate`, `Question`, `WarQuestion`
- `MatchSnapshot` ← новая

### 3.7. Аналитика
Запросы переписываются на `MatchSnapshot.finalState` + `MatchSnapshot.telemetry` JSON. Данных НЕ становится меньше — структура плотнее (один row на матч вместо сотен).

---

## Phase 4 — Auth + lobby integration (день 6)

### 4.1. JWT в Colyseus
`onAuth` декодит cookie тем же `jose`:
```ts
async onAuth(client, options: { jwt: string }) {
  const payload = await decrypt(options.jwt);
  if (!payload?.userId) throw new Error("unauthorized");

  const profile = await prisma.playerProfile.findUnique({
    where: { userId: payload.userId },
  });
  if (!profile) throw new Error("no profile");

  return { userId: payload.userId, profileId: profile.id };
}
```

### 4.2. Передать JWT с клиента
В `MatchClient`:
```tsx
const jwt = document.cookie.split("session=")[1]?.split(";")[0];
connect(sessionId, jwt);
```
(или через server component передать токен в props)

### 4.3. Lobby → match handoff
В лобби при start game:
1. Next.js server action ставит `GameSession.status = "active"` (как сейчас)
2. Realtime UPDATE летит лоббистам → редиректят на `/match/[id]`
3. На `/match/[id]` `MatchClient` подключается к Colyseus `joinOrCreate("match", { sessionId, jwt })`
4. Colyseus `onCreate(options)` загружает players + choices из Postgres, создаёт state
5. Все 4 клиента дожидаются `onJoin` → начинаем матч

---

## Phase 5 — Telemetry + аналитика (день 7)

### 5.1. Сбор телеметрии в Colyseus
В MatchRoom держим `private telemetry: TelemetryAccumulator`:
```ts
type TelemetryAccumulator = {
  numericAnswers: Array<{
    playerId, questionId, value, firstInputAtMs, inputChangeCount, answeredAt
  }>;
  warAnswers: Array<{ playerId, attackId, isCorrect, submittedAtMs }>;
  hoverTrails: Array<{ playerId, action, hoveredSvgIds, chosen, ts }>;
  choices: Array<{ playerId, key, value }>;
};
```

На game_over → pишем в `MatchSnapshot.telemetry`.

### 5.2. Analytics page переписать запросы
Вместо `prisma.playerAnswer.findMany(...)` теперь читаем `MatchSnapshot.telemetry` JSON и агрегируем там же. Все queries которые сейчас в `apps/web/app/analytics/page.tsx` переписываются на новую структуру — план тот же, источник другой.

---

## Phase 6 — Деплой (день 8)

### 6.1. Vercel — для `apps/web`
- Подключить repo
- `Root Directory: apps/web`
- `Install: pnpm install`
- `Build: pnpm build` (внутри workspace, увидит packages)
- Env vars: те же что сейчас + `NEXT_PUBLIC_GAME_SERVER_URL=wss://...`

### 6.2. Railway — для `apps/game`
- Подключить repo
- `Root Directory: apps/game`
- `Start: pnpm tsx src/index.ts`
- Env vars: `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET` (тот же что у Next.js — для JWT)
- Custom domain → получить wss-адрес → положить его в `NEXT_PUBLIC_GAME_SERVER_URL` на Vercel

### 6.3. CORS / WebSocket
В Colyseus сервере разрешить origin Vercel-домена.

---

## Phase 7 — Тесты + polish (дни 9-10)

### 7.1. E2E тест happy path
Один полный матч: 2 игрока, capitals → expand → war → ended. Записать на видео для защиты.

### 7.2. Reconnect handling
Colyseus встроенно поддерживает: `room.allowReconnection(client, 30)` в `onLeave` — игрок может закрыть вкладку и вернуться в течение 30 секунд.

### 7.3. Cleanup
Удалить из Next.js:
- `actions.ts` матча (переехал в Colyseus)
- API routes для активного состояния (`/api/sessions/[id]/question`, `/attack`, `/match/[id]/countries`) — больше не нужны
- Все Supabase realtime подписки в матч-компонентах
- `validateSession`, polling watchdogs, atomic SQL claims

---

## Что переиспользуем 1:1 (нулевые изменения)

- ✅ Auth: login/register/JWT/middleware
- ✅ Dashboard, profile (`/profile/[nickname]`), settings
- ✅ Pure game logic (`gameLogic.ts`) — все 120 тестов проходят
- ✅ Question pools (`Question`, `WarQuestion` таблицы)
- ✅ CountryTemplate (карта Европы)
- ✅ Demographic schema (`PlayerProfile.birthYear`, `gender`, `mbti`, etc)
- ✅ Match choices (`MATCH_CHOICES` каталог)
- ✅ Profile reminder banner, category badge UI

## Что переписываем

- 🔁 Match-screen компоненты — читают Zustand вместо собственных useState
- 🔁 Game logic — переезжает в `MatchRoom` (но алгоритмы те же)
- 🔁 Lobby → match handoff — через Colyseus join вместо realtime редиректа
- 🔁 Analytics queries — на `MatchSnapshot.telemetry` JSON

## Что выбрасываем

- ❌ Supabase Realtime подписки в матче (~8 каналов на игрока)
- ❌ `polling watchdogs` в ActionPanel и EuropeMap
- ❌ Atomic SQL claims (`UPDATE ... WHERE pickOrder[1] = $playerId`, `NOT EXISTS` для capital, etc)
- ❌ `validateSession` invariant checker (не нужен — single-threaded loop)
- ❌ Live-таблицы: `MatchQuestion`, `PlayerAnswer`, `WarAttack`, `WarAnswer`, `MatchEvent`, `MatchCountry`, `MatchChoice`
- ❌ API routes для активного состояния
- ❌ `forceAutoPick`, `forceAutoAttack`, `forceResolveQuestion`, `forceStartQuestion`, `forceAutoCapital`, `forceResolveAttack` — заменяется встроенным `this.clock`

## Risk / на что обратить внимание

1. **Деплой Colyseus на Railway первый раз** — можно потерять полдня на настройку. Запасной план — Fly.io.
2. **JWT shared secret** — `SESSION_SECRET` должен быть один и тот же на Vercel и Railway, иначе Colyseus не сможет декодить cookie.
3. **CORS на WebSocket** — Colyseus по умолчанию разрешает все origin'ы, но в проде надо ограничить.
4. **Reconnect UX** — игрок закрыл вкладку → если в течение 30с вернулся, продолжает. Иначе room продолжает игру без него (как сейчас если кто-то закрыл).
5. **Тесты на game logic** — переиспользуются как есть, это сильная страховочная сетка.

## Checkpoints

После каждой фазы — `pnpm test && pnpm build` в обоих apps/web и apps/game. Tests должны быть зелёные, build проходить. Иначе — стоп и фикс.

---

## Шпаргалка команд

```bash
# Запуск всего локально (двумя терминалами)
cd apps/web && pnpm dev          # → :3000
cd apps/game && pnpm dev         # → :2567

# Тесты
pnpm -r test                     # запуск во всех workspace'ах

# Prisma миграции
cd packages/db && pnpm prisma db push

# Проверка типов
pnpm -r exec tsc --noEmit
```

---

**Утром начинаем с Phase 0.** Удачи на сон. ✌️
