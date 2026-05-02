# Сменимся (Smeni-menya)

Mobile-first PWA для двух пользователей (Светы и Марии), чтобы делить дежурства по уходу за мамой. Недельный вид, реалтайм-синхронизация, обмен сменами с подтверждением, push-уведомления.

## Стек

- **Frontend:** React + Vite + Zustand + React Query + vite-plugin-pwa
- **Backend:** Node.js (Express) + PostgreSQL + native `ws`
- **Realtime:** WebSocket (`/ws`)
- **Push:** Web Push (VAPID)
- **Auth:** JWT, два фиксированных аккаунта (`SVETA` / `MARIA`)
- **Деплой:** Docker (Railway-ready)

## Структура

```
backend/   Node.js API + WebSocket + миграция схемы
frontend/  React PWA
docker-compose.yml
```

## Быстрый старт (Docker)

```bash
# 1. Сгенерировать VAPID-ключи (опционально, для push)
npx web-push generate-vapid-keys

# 2. Скопировать .env
cp backend/.env.example backend/.env
# и положить ключи в backend/.env (или передать через docker-compose env)

# 3. Поднять стек
docker compose up --build
```

- Frontend: http://localhost:8081
- Backend: http://localhost:8080
- DB: postgres://postgres:postgres@localhost:5432/smeni

## Локальная разработка

### Backend
```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend (Vite) проксирует `/api` и `/ws` на `localhost:8080`.

## Логины по умолчанию

| Кто  | Пароль (можно менять через env) |
|------|----------------------------------|
| SVETA | `sveta123` (env `SVETA_PASSWORD`) |
| MARIA | `maria123` (env `MARIA_PASSWORD`) |

## API

| Метод | Путь | Описание |
|------|------|----------|
| POST | `/auth/login` | `{ name, password }` → `{ token, name }` |
| GET  | `/auth/me` | вернуть текущего пользователя |
| GET  | `/auth/vapid` | публичный VAPID ключ |
| POST | `/push/subscribe` | сохранить push-subscription |
| GET  | `/week?start=YYYY-MM-DD` | 7 дней начиная с понедельника |
| PATCH| `/day/:id` | обновление дня (требует `version` для optimistic lock) |
| POST | `/swap` | `{ from_date, to_date }` → создать запрос |
| GET  | `/swap` | pending-запросы пользователя |
| POST | `/swap/:id/respond` | `{ action: "accept" \| "reject" }` |
| GET  | `/stats?start=...` | счётчики по сменам за неделю |

## WebSocket события (`/ws?token=...`)

- `DAY_UPDATED` — день изменён
- `SWAP_CREATED` — новый запрос на обмен
- `SWAP_UPDATED` — запрос принят/отклонён

## UX

- Тап по карточке → редактировать день
- Долгое нажатие → запросить обмен
- Свайп влево/вправо по списку → следующая/предыдущая неделя
- Цвета: 🟢 Света, 🔵 Мария, 🟡 Никто, ⚪ Не назначено
- Чекбокс «Основная работа» — отмечает рабочий день
- Toast при изменении другим пользователем (real-time)
- Push-уведомления (если включены VAPID)

## Конфликты и optimistic locking

Каждый день имеет `version`. PATCH с устаревшей версией возвращает `409 version_conflict` и текущее состояние. Клиент перезагружает неделю.

## Деплой на Railway

Подробная пошаговая инструкция — см. [`DEPLOY.md`](./DEPLOY.md).

Кратко:
1. Postgres-сервис в Railway
2. Backend-сервис: root `backend/`, Dockerfile, env: `DATABASE_URL`, `JWT_SECRET`, пароли, опц. VAPID
3. Frontend-сервис: root `frontend/`, Dockerfile, build-args `VITE_API_BASE=/api` и `VITE_WS_BASE=`, env `BACKEND_HOST`
