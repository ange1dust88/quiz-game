# Дипломная работа — идеи и заметки

## Цель работы
Собирать данные о поведении пользователей в игре + демографию из настроек,
затем использовать их для **классификации/предсказаний об игроках** —
психометрический профиль, экспертиза, стиль игры.

Игра — это инструмент сбора данных. ML/анализ — академический вклад.

---

## Что уже сделано

- ✅ Демография в `/settings` (год рождения, пол, страна, город,
  образование, занятие, интересы, био)
- ✅ Публичный профиль `/profile/[nickname]` — приватные поля видны только
  владельцу
- ✅ Обновление статов после матча (gamesPlayed/Won/Lost, ELO, XP, level)
- ✅ Чистые helpers + unit-тесты (`computeEloChanges`, `computeXpEarned`,
  `applyExperience`)
- ✅ **Категории вопросов** — enum `QuestionCategory` в схеме
  (geography/history/math/science/sports/pop_culture/language/general),
  бейджик в UI на Expand-вопросах + War-MC + tie-breaker
  ([CategoryBadge.tsx](app/components/ui/CategoryBadge.tsx))
  - ⚠️ Существующие вопросы в БД сейчас все `general` (default).
    Бэкфилл — руками через Prisma Studio (`npx prisma studio`) или
    через будущий seed.
- ✅ **Гранулярная телеметрия**:
  - `PlayerAnswer.firstInputAtMs` — задержка перед первым нажатием клавиши
    (мс от начала вопроса)
  - `PlayerAnswer.inputChangeCount` — кол-во изменений значения (proxy для
    неуверенности/правок)
  - `WarAnswer.submittedAtMs` — момент клика по варианту (мс от начала MC)
  - **Map hover trail** — список стран, на которые игрок наводил мышью перед
    кликом, логируется в `MatchEvent.payload.hovered` для всех 3 стадий
    (capital pick, territory pick, attack target). Серверная санитизация
    дедупит и кэпает до 50 шагов.
- ✅ **Простой analytics дашборд** `/analytics` — кнопка с дашборда:
  - Overview: игроков / завершённых игр / numeric ответов / war ответов
  - Точность War MC по категориям (бар-чарт)
  - Avg "thinking time" (firstInputAtMs) по уровню образования
  - Avg input changes по категории вопроса
  - Демография: возраст / образование / пол
  - Пока без auth-гейта (на будущее — закрыть от обычных юзеров)
- ✅ **Pre-match choices** — в лобби карточка "Capital style":
  - 🛡️ Standard (3 HP / 1000 pts) vs ⚔️ Risky (2 HP / 1500 pts)
  - Одинаковый stake, разный risk profile → психометрический сигнал
  - Хранится в новой таблице `MatchChoice (playerInGameId, key, value)` —
    расширяемо, легко добавлять новые карточки выбора через
    [matchChoices.ts](app/lib/matchChoices.ts)
  - Учитывается в `claimCapital`, `forceAutoCapital`, `devSkipStage`
  - `MatchCountry.maxArmies` — новое поле, корректно рендерит HP-точки
    для variable max (2 vs 3)
  - Реалтайм-синхронизация в лобби: бейджик с выбором у каждого игрока
- ✅ **Структурированные опции в /settings** + психометрия:
  - `occupation` — был free-text, теперь preset (14 категорий: tech /
    healthcare / education / arts / science / etc.)
  - `mbti` — выбор из 16 типов личности (INTJ, ENFP, ...) + "Don't know"
  - `iqScore` — числовое поле (50-200) если знают
  - `personalityTraits` — multi-select из 16 черт (analytical, creative,
    organized, sociable, calm, ambitious, etc.) — pill-toggle UI
  - Все опции вынесены в [profileOptions.ts](app/lib/profileOptions.ts) —
    общий source of truth для формы и валидации
  - **Удалены `bio` и `interests`** — free-text не пригоден для простой
    модели. Оставлены только категориальные/числовые фичи.

---

## Идеи для сбора данных

### 1. Категоризация вопросов ★★★★ value, ★ cost
Поле `category` в `Question`/`WarQuestion`:
`geography`, `history`, `math`, `science`, `sports`, `pop_culture`, `language`.

**Даёт:**
- Точность по категории на юзера → профиль экспертизы
- Корреляция образования/профессии с категориями → дипломная гипотеза

### 2. Стратегические выборы (pre-match draft) ★★★★★ value, ★★★ cost
Бинарные карточки выбора перед матчем:
- 3 HP столица без бонуса **vs** 2 HP + 1 свободное соседнее государство
- +30% времени на ответ **vs** +10% к очкам территорий
- Право первой атаки **vs** -1 урон при первой защите
- Узнать категорию следующего вопроса **vs** +5с на ответ

**Зачем:**
Прямой psychometric сигнал — risk seeker vs averse, time-pressure tolerance,
planning horizon. Можно кластеризовать. Самая новаторская фича — в дипломе
представляется как "experimental game design eliciting implicit preferences".

### 3. Гранулярное время ★★★★ value, ★ cost
- `firstClickAtMs` — первое нажатие на вариант
- `changedAnswerCount` — сколько раз менял ответ (неуверенность)
- `hoveredCountriesBeforeClick` — сколько стран навёл мышью до клика
  (планирование)

**Даёт:**
- Распределение "время → точность"
- Связь возраста с реакцией
- Detection Dunning-Kruger: быстрые уверенные неправильные ответы

### 4. Self-rating в settings ★★★ value, ★ cost
"Оцени свою экспертизу 1-5" по категориям из #1.

Сравнение self-rated vs actual accuracy = **calibration error**.
Очень красивый график для защиты (overconfident vs underconfident).

### 5. Поведение в игре ★★★ value, ★★ cost
Новая таблица `PlayerBehavior` или агрегаты в `MatchEvent`:
- Aggression score: атаковал / получил атак
- Target selection: бил слабого/сильного/случайного
- Capital pick bias: центральная/островная/угловая страна
- Comeback behavior: после серии поражений атакуешь чаще или реже?
- Late-buzzer ratio: % ответов в последние 3 секунды

### 6. Сессионные данные ★★ value, ★ cost
Бесплатно из существующих таблиц:
- Время суток (`MatchEvent.createdAt`)
- Длительность сессии
- Дни между сессиями (engagement)
- Винрейт по часу дня

### 7. Опросник после матча ★★ value, ★★ cost
1 вопрос:
- "Насколько повезло (1-5)?"
- "Понравился матч (1-5)?"
- "Сильнее были вы или соперник?"

Subjective vs objective — fairness perception.

---

## Порядок реализации (рекомендация)

1. **Категории вопросов** (#1) — база для всего остального
2. **Стратегические выборы** (#2) — флагман, novel
3. **Гранулярное время + ховеры** (#3) — почти бесплатно, много данных
4. **Self-rating в settings** (#4) — 5 минут работы, мощный график

Получится **3 независимых измерения** для классификации:
- **Знания** (category accuracy)
- **Стиль** (strategic choices + game behavior)
- **Метакогниция** (self-rating vs actual)

На защите — k-means кластеризация по этим фичам, подписать кластеры
("Speedster", "Cautious Strategist", "Trivia Master", "Beginner-Lucky").

---

## Замечено при аудите — обсудить вместе

### UX полиш (не критично)
- **Звуковые эффекты** — старый код имел tick / submit / capture / capitalFall / victory / defeat sounds через `app/lib/sounds.ts` (Web Audio synthesizer). В новом UI всё тихо. Можно перенести.
- **Animations on capture** — старый `EuropeMap` пульсировал захваченную страну (`country-captured` class на 750мс). Можно добавить через diff между prev/current `countries` в store.
- **Event feed** — старый матч имел правую панель с лентой "X took Poland", "Capital fell". В новом UI нет. Можно добавить из `MatchEvent` (которой уже нет) или генерировать клиентом из state diffs.
- **Карта pan/zoom** — старая поддерживала колесо/драг для зума и панорамы. Новая статичная. Если на маленьком экране — может быть проблемой.
- **Tooltip на hover** — старая показывала плашку рядом с курсором (страна, владелец, очки, HP). Новая использует SVG `<title>` (хуже UX, появляется только через ~1с).
- **Анимация капитала падает** — звук + красная вспышка по всей карте. Лоудно показать масштаб события.

### Геймплей
- **Reconnect UI** — сейчас сервер держит слот 30с но клиент не показывает "X is reconnecting...". Можно добавить badge/индикатор.
- **Surrender/leave button** — нет способа выйти из идущего матча кроме закрытия вкладки. Может быть нужен "Concede" с подтверждением.
- **Spectator mode** — сейчас onAuth отбрасывает не-участников. Может стоить пускать как "watch only"?
- **Player stats during match** — в шапке показывается только stage. Можно добавить: кто-то-побеждает по очкам, твой rank среди игроков.

### Аналитика / для дипломки
- **Реал-тайм dashboard для админа** — пока матчи идут, видеть что происходит. Не критично, но красиво.
- **Кросс-табы** — `MBTI × accuracy by category`, `age × reaction time`, `education × winrate`. Сейчас аналитика показывает каждое измерение отдельно. Кросс-табы — главный инсайт диплома.
- **K-means clustering** — сделать в Jupyter notebook с экспортом из MatchSnapshot.telemetry. Это академический вклад.
- **Калибровка self-rating vs actual** — сейчас в settings нет self-rating экспертизы по категориям. Если добавить — Dunning-Kruger график.

### Стабильность / прод
- **Rate limit на Colyseus matchmaking** — кто-то может спамить joinOrCreate. Не критично для дипломки.
- **Health endpoint** — `/health` на game сервере для Railway healthchecks.
- **Graceful shutdown** — на SIGTERM не сохраняем state in-flight матчей. Если game-server рестартует, активные матчи теряются. Не критично для дипломки.
- **MatchSnapshot retention** — telemetry JSON растёт. Если 1000 игр × 50KB = 50MB. Не проблема, но через год понадобится cleanup.

## Открытые вопросы

- Как и где хранить агрегаты? Денормализованная `PlayerFeatures` таблица
  обновляется после матча? Или считать на лету из `MatchEvent` + `PlayerAnswer`?
- Бэкфилл существующих вопросов категориями — руками или GPT?
- Будет ли отдельный `/analytics` дашборд для исследования (агрегаты по всем
  юзерам, корреляции, кластеры)?
- Этический аспект: что упомянуть в `/settings` плашке про сбор данных?
  (сейчас просто "for diploma research")

---

## Технический долг

- Папки `prisma/migrations` нет — проект на `prisma db push`. Если хочется
  proper history — `prisma migrate diff` для baseline.
- `prisma/seed.ts` упоминается в config, но не существует. После fresh clone
  `Question`/`WarQuestion`/`CountryTemplate` пустые.
- В `EuropeMap.tsx` props типизированы как `any[]`.
