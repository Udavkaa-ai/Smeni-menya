# CLAUDE.md

Контекст для Claude Code (или другой AI-сессии), которая работает с этим репозиторием.

## Что это

«Сменимся» — mobile-first PWA для двух конкретных пользователей (Света и Мария), чтобы делить дежурства по уходу за мамой. Не SaaS, не multi-tenant: жёстко вшито двое — `SVETA` и `MARIA`.

## Структура

```
backend/         Node.js + Express + PostgreSQL + ws
  src/
    index.js     все HTTP-роуты, broadcast по WebSocket
    migrate.js   идемпотентные миграции схемы при каждом старте
    auth.js      JWT-логин для двух фиксированных юзеров
    db.js        pg.Pool с warm-up (min=2)
    push.js      Web Push (VAPID), нормализует subject
    realtime.js  WebSocket-сервер + клиент-pinger
  Dockerfile     Node 20 alpine

frontend/        React + Vite + Zustand + React Query
  src/
    App.jsx              корневой компонент, realtime, push, toast
    main.jsx             точка входа
    styles.css           всё CSS-оформление (пастель, тема)
    sw.js                service worker, обработчик push (injectManifest)
    api/
      client.js          fetch-клиент с JWT, методы api.*
      realtime.js        WS-обёртка с reconnect/backoff
      push.js            подписка на push, передача VAPID-ключа
    components/
      Login.jsx          выбор Sveta/Maria + пароль (eye toggle, last user memo)
      WeekView.jsx       список карточек, swipe, свёртка прошедших дней
      DayCard.jsx        одна карточка дня — рендерит все смены, free, blocked
      DayModal.jsx       редактор дня (duty + work + free-gap + transfer)
      SwapModal.jsx      «предложить обмен» (long-press по карточке)
      SwapBanner.jsx     входящий запрос на обмен/передачу
    store/
      useWeekStore.js    zustand: текущий weekStart, toast
    utils/
      format.js          русские даты, computeDayCoverage (free/blocked), …
  Dockerfile             nginx alpine, шаблон + entrypoint для resolver
  nginx.conf             прокси /api и /ws на backend (env-driven)
  docker-entrypoint.d/15-set-resolver.sh  читает resolv.conf для DNS

docker-compose.yml       db + backend + frontend для локального запуска
DEPLOY.md                инструкция по деплою на Railway
```

## Модель данных

Текущая схема (см. `backend/src/migrate.js`):

```sql
users        (id, name SVETA|MARIA, password_hash, push_subscription)

shifts       (id, date,
              user_name SVETA|MARIA|NONE,
              kind 'duty'|'work',         -- ⚠ duty = дежурство, work = осн. работа
              start_time, end_time,        -- HH:MM
              description, is_work_day,    -- is_work_day legacy boolean
              version, updated_by, updated_at)
              -- НЕТ unique(date,user_name) — допускается несколько смен у юзера на день
              -- partial unique index: (date) WHERE user_name='NONE' (один маркер на день)

swap_requests (id, from_user, to_user, from_date, to_date,
               type 'swap'|'transfer',
               shift_id    -- для transfer: id передаваемой смены
               status PENDING|ACCEPTED|REJECTED|CANCELLED,
               created_at)

audit_log    (id, actor, action, payload jsonb, created_at)

days         -- legacy v1, оставлена для совместимости/миграции, новый код не пишет
```

**Важно про kind**:
- `duty` — пользователь дежурит в этот промежуток (присматривает за мамой)
- `work` — пользователь занят на основной работе, **не может** дежурить
- На фронте они визуально разные. `is_work_day` — старый булев флаг, оставлен для backward compat, новые сущности задают `kind` явно.

## Авторизация

Только два аккаунта: `SVETA` и `MARIA`. Пароли — env-переменные `SVETA_PASSWORD` / `MARIA_PASSWORD` на backend. JWT-токен живёт 30 дней в `localStorage` (`sm_token`). При логине запоминается последний юзер в `sm_last_user` для удобства повторного входа.

## API

| Метод | Путь | Назначение |
|------|------|-----------|
| POST | `/auth/login` | `{name, password}` → `{token, name}` |
| GET  | `/auth/me` | возвращает текущего юзера |
| GET  | `/auth/vapid` | публичный VAPID ключ для подписки на push |
| POST | `/push/subscribe` | сохранить push-subscription пользователя |
| GET  | `/week?start=YYYY-MM-DD` | 7 дней (понедельник-старт), каждый с `shifts: []` |
| POST | `/shift` | создать смену; body: `{date,user_name,kind,start_time,end_time,description,is_work_day}` |
| PATCH | `/shift/:id` | обновить (требует `version` для optimistic lock) |
| DELETE | `/shift/:id?version=N` | удалить с проверкой версии |
| POST | `/shift/:id/transfer` | предложить передать смену другой |
| POST | `/swap` | предложить обмен `{from_date, to_date}` |
| GET  | `/swap` | список pending-запросов пользователя |
| POST | `/swap/:id/respond` | `{action:"accept"\|"reject"}` |
| GET  | `/stats?start=...` | счётчики смен по юзерам за неделю |

## WebSocket события (`/ws?token=...`)

- `SHIFT_UPSERTED` — `{shift, action: 'added'|'updated'}`
- `SHIFT_REMOVED` — `{id, date, user_name, prev}`
- `SWAP_CREATED` — обмен или передача создан
- `SWAP_UPDATED` — accepted/rejected

WS broadcast пропускает отправителя — он уже видит изменение локально.

## Push-уведомления

VAPID, отправляются пуши с structured payload:
- `shift_added` / `shift_removed` / `shift_updated`
- `none_marked` / `none_unmarked`
- `shift_request` (обмен) / `shift_accepted` / `shift_rejected`
- `transfer_request` (передача)
- `empty_day_warning`

Service worker (`frontend/src/sw.js`) форматирует payload в русский текст: «Мария взяла вс 3 мая, 11:00–15:00».

То же форматирование используется в in-app toast — функция `formatNotification` в `frontend/src/utils/format.js`. Если меняешь строки — меняй в обоих местах.

## UX-логика, которую важно сохранить

- **Тап** по карточке дня → `DayModal` (редактирование своих смен)
- **Долгое нажатие** по карточке дня → `SwapModal` (предложить обмен)
- **Свайп** влево/вправо в области списка → следующая/предыдущая неделя
- **Прошедшие дни** свёрнуты, разворачиваются по кнопке `▸ Прошедшие дни (N)`
- **Цвет**: 🟢 Sveta (#6FCF97), 🔵 Maria (#6BA4F0), 🟡 NONE/blocked (#FFB570), сиренево-розовый градиент (primary)
- **Карточка** автоматически показывает:
  - Свободные интервалы — без явного маркера, считаются от union-всех-duty-смен
  - «Никто не сможет» — пересечение work-блоков обеих юзеров (auto)
  - Конфликты — две duty-смены с пересечением во времени → красная плашка
- **Модалка** показывает:
  - Чужие смены сверху (read-only)
  - Свободное время с кнопкой «+ беру» (создаёт черновик duty на этом интервале)
  - Свои дежурства (редактируемые), с кнопкой «→ Мария» для передачи
  - Свою основную работу (отдельная секция)
  - Чекбокс «Никто из нас не сможет (весь день)»

## Деплой

Railway, три сервиса в одном проекте:

1. **Postgres** — Railway plugin
2. **backend** — root `backend/`, Dockerfile; env: `DATABASE_URL`, `DATABASE_SSL=true`, `JWT_SECRET`, `SVETA_PASSWORD`, `MARIA_PASSWORD`, опционально `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`
3. **frontend** — root `frontend/`, Dockerfile; env:
   - `BACKEND_HOST=<service>.railway.internal:8080`
   - `BACKEND_PROTO=http`
   - `BACKEND_HOST_HEADER=<service>.railway.internal`

⚠ Railway private networking — IPv6. nginx-resolver получает nameservers из `/etc/resolv.conf` через `docker-entrypoint.d/15-set-resolver.sh` (IPv6 заворачиваются в `[ ]`). Не использовать `upstream {}` блоки — они кешируют DNS на старте, после redeploy backend ловится 504. Поэтому в `nginx.conf` `proxy_pass http://$backend_upstream` через переменную, чтобы DNS-резолвинг был request-time с TTL 10s.

После каждого изменения env-переменных у frontend — **обязательно Redeploy**, иначе nginx работает со старой конфигурацией.

## Локальная разработка

```bash
docker compose up --build      # Postgres + backend + nginx-frontend
# фронт: http://localhost:8081
# бэк:   http://localhost:8080
# psql:  postgres://postgres:postgres@localhost:5432/smeni
```

или раздельно:

```bash
cd backend && cp .env.example .env && npm install && npm run dev
cd frontend && npm install && npm run dev   # vite dev сервер на 5173, проксит /api и /ws на 8080
```

## Чего НЕ делать

- Не возвращать `UNIQUE(date, user_name)` на shifts — пользователи специально просили несколько смен на день.
- Не возвращать упрощённую схему `days.assigned_to` (одного дежурного) — спецификация эволюционировала.
- Не использовать `upstream {}` блок в nginx без `resolver` — DNS закешируется и после backend redeploy будет 504.
- Не убирать `[]` вокруг IPv6 в resolver — nginx упадёт на старте.
- Не убирать `kind` из API — фронт от него зависит для разделения duty/work.
- Не делать deploy на ветку `main` — текущая ветка `claude/shift-management-pwa-jAKgg`, она задеплоена в Railway. Ветку проверять через `git branch --show-current`.

## Принудительная очистка кеша у юзеров

В `frontend/src/main.jsx` есть константа `APP_DATA_VERSION`. При несовпадении значения в `localStorage.sm_data_version` со значением в коде — клиент **автоматически**:

1. Сохраняет JWT и имя последнего юзера (чтобы не разлогиниться)
2. Чистит остальной `localStorage`
3. Удаляет все записи из `Cache Storage` (это включает SW-кеш ассетов)
4. Отписывается от всех зарегистрированных Service Workers
5. Показывает «Обновляю до новой версии…» и перезагружает страницу

После reload версия совпадает — нормальный рендер. Юзер видит сплеш на доли секунды и всё.

**Версия бампится автоматически при каждой сборке** — в `vite.config.js` определяется `APP_DATA_VERSION` из (по приоритету):

1. `process.env.VITE_BUILD_ID` (если CI выставит явно)
2. `process.env.RAILWAY_DEPLOYMENT_ID`
3. `process.env.RAILWAY_GIT_COMMIT_SHA`
4. `new Date().toISOString()` (фолбек)

В production-сборке Vite через `define` подставляет это в `__APP_DATA_VERSION__` в коде. Каждый Railway redeploy → уникальная версия → у всех клиентов сработает миграция при следующем открытии. Никаких ручных правок константы не нужно.

В dev-режиме (`npm run dev`) версия равна времени старта Vite — обычно не вызывает миграцию между HMR-обновлениями, но при полном рестарте dev-сервера локальный браузер тоже самочистится один раз.

## Известные ограничения и хвосты

- Backend logs пишут только консоль; для долгого debug удобно поднять структурированный логгер.
- `audit_log` пишется но никогда не читается — есть смысл добавить admin-эндпоинт.
- Нет автоматической отмены устаревших pending swap_requests; копятся.
- Conflict-detection на фронте не реагирует на оптимистичные обновления — пересчитывается на каждом render (дёшево, ок).
- iOS Web Push требует установки в «На главный экран» из Safari, иначе не подпишется.
