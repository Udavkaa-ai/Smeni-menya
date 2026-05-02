# Деплой «Сменимся» на Railway — пошагово

Не страшно, всё по шагам. Понадобится: GitHub-аккаунт (репо у тебя уже есть) и аккаунт на [railway.com](https://railway.com).

В Railway мы создадим **один проект** с тремя сервисами:

1. **Postgres** (база данных)
2. **Backend** (API + WebSocket)
3. **Frontend** (статический сайт + nginx, проксирует `/api` и `/ws` на backend)

---

## Шаг 0. Сгенерировать VAPID-ключи (для push-уведомлений)

Если push не нужен — можно пропустить, всё будет работать без них.

На своём компьютере:

```bash
npx web-push generate-vapid-keys
```

Получишь две строки:
```
=======================================
Public Key:
BG... (длинная)

Private Key:
H... (короче)
=======================================
```

Сохрани их в текстовый файл — пригодятся на шаге 2.

---

## Шаг 1. Создать проект и Postgres

1. Открой [railway.com](https://railway.com), залогинься через GitHub.
2. Нажми **New Project** → **Deploy PostgreSQL**.
3. Через секунду появится сервис **Postgres**. Кликни по нему → вкладка **Variables**.
4. Найди переменную `DATABASE_URL` — скопируй её значение, оно начинается с `postgresql://`. Пригодится в шаге 2.

> Можно не копировать вручную: в шаге 2 Railway даёт связать сервисы переменными.

---

## Шаг 2. Backend

1. В том же проекте: **+ Create** → **GitHub Repo** → выбери `udavkaa-ai/smeni-menya`.
2. Когда сервис создастся, кликни по нему → вкладка **Settings**:
   - **Root Directory**: `backend`
   - **Builder**: `Dockerfile` (Railway обычно сам подхватит `backend/Dockerfile`)
   - **Custom Start Command**: (оставь пустым, в Dockerfile уже есть `CMD`)
3. Перейди во вкладку **Variables** и добавь:

| Имя | Значение |
|------|----------|
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` ← так Railway сам подставит URL базы |
| `DATABASE_SSL` | `true` |
| `JWT_SECRET` | любая длинная случайная строка, например `openssl rand -hex 32` или просто 30+ случайных символов |
| `SVETA_PASSWORD` | пароль Светы |
| `MARIA_PASSWORD` | пароль Марии |
| `VAPID_PUBLIC_KEY` | публичный ключ из шага 0 (или пусто) |
| `VAPID_PRIVATE_KEY` | приватный ключ из шага 0 (или пусто) |
| `VAPID_SUBJECT` | `mailto:твой@email.ru` |

> Чтобы поставить ссылку на переменную из другого сервиса (как `${{ Postgres.DATABASE_URL }}`): в поле значения выбери справа кнопку **Add Reference** → Postgres → DATABASE_URL.

4. Вкладка **Settings** → секция **Networking** → нажми **Generate Domain**. Получишь URL вида `smeni-menya-backend-production.up.railway.app`. **Скопируй его**, понадобится для frontend.

5. Подожди, пока сервис задеплоится (вкладка **Deployments** покажет статус **Active**). Открой `https://<твой-backend-домен>/health` — должно вернуть `{"ok":true}`.

---

## Шаг 3. Frontend

1. В проекте: **+ Create** → **GitHub Repo** → снова выбери `udavkaa-ai/smeni-menya`.
2. В **Settings**:
   - **Root Directory**: `frontend`
   - **Builder**: `Dockerfile`
3. Вкладка **Variables**, добавь:

| Имя | Значение | Пояснение |
|------|----------|-----------|
| `BACKEND_HOST` | `smeni-menya-backend-production.up.railway.app:443` | домен backend из шага 2 + `:443` |

> На Railway внешний хост слушает 443 (HTTPS). nginx внутри фронта будет ходить на этот upstream по HTTPS — но внутренняя проксировка работает через приватные сетевые имена. Лучший вариант — внутренний адрес (см. ниже **«Альтернатива: приватная сеть»**).

4. Так как фронтенд собирается как статика и API URL зашит в бандл, нам нужно передать **build-args**. На Railway это делается через секцию **Build** в Settings:
   - **Build Variables** (build-args):
     - `VITE_API_BASE` = `/api`
     - `VITE_WS_BASE` = `` (пусто — клиент сам построит wss-URL от текущего хоста)

5. Вкладка **Settings** → **Networking** → **Generate Domain**. Получишь URL фронтенда — это и есть адрес приложения.

6. Открой полученный URL — должна загрузиться страница входа «Сменимся».

---

### Альтернатива: внутренняя сеть Railway (рекомендуется)

Railway поддерживает **private networking** — сервисы могут общаться между собой без выхода в интернет.

В Backend Settings → Networking → включи **Private Networking** и скопируй **Private domain**, что-то вроде `smeni-menya-backend.railway.internal`.

Тогда в переменных Frontend ставь:
```
BACKEND_HOST=smeni-menya-backend.railway.internal:8080
```

Это быстрее и не тратит исходящий трафик.

---

## Шаг 4. Первый вход

Логины задаются в backend env (`SVETA_PASSWORD`, `MARIA_PASSWORD`). Открой URL фронтенда → выбери имя → введи пароль.

Schema БД создаётся автоматически при первом запуске backend.

---

## Шаг 5. Установить как приложение на телефон

### iPhone (Safari)
1. Открой URL приложения в Safari.
2. Кнопка «поделиться» (квадратик со стрелкой) → **На экран «Домой»**.
3. На рабочем столе появится иконка с лавандово-розовым календариком ❤️.

### Android (Chrome)
1. Открой URL в Chrome.
2. Меню (три точки) → **Установить приложение** (или появится баннер «Добавить на главный экран»).
3. На рабочем столе — та же иконка.

После установки — открывается без браузерных панелей, как настоящее приложение.

---

## Шаг 6. Push-уведомления

Если ты добавила VAPID-ключи в backend, при первом входе iPhone/Android спросит разрешение на уведомления — нажми «Разрешить». Дальше другая девочка будет получать пуш каждый раз, когда:
- кто-то изменил день,
- пришёл запрос на обмен,
- запрос на обмен принят/отклонён,
- день остался без дежурного.

**iOS важно**: push в PWA работает только начиная с iOS 16.4 и **только если приложение установлено на главный экран** (не из браузера).

---

## Если что-то не работает

| Симптом | Что сделать |
|---------|-------------|
| Frontend открывается, но показывает «Ошибка сети» при логине | Проверь `BACKEND_HOST` во frontend — без `https://`, только хост и порт. |
| WebSocket не подключается (значок «оффлайн») | В nginx логах frontend сервиса посмотри ошибки proxy. Если хост через интернет — `BACKEND_HOST=...:443` и nginx `proxy_pass http://...` должен быть `https://...` (см. ниже «Если backend по HTTPS»). |
| Push не приходят | Проверь, что VAPID-ключи одинаковые на backend (env) и фронт получает их через `/auth/vapid`. На iOS: установлено ли как PWA? |
| После апдейта страница «висит» на старой версии | Открой настройки сайта в браузере → удали данные → перезагрузи. SW обновится. |

### Если backend по HTTPS (внешний домен)

Если ты используешь публичный домен backend (а не private), отредактируй `frontend/nginx.conf`:

```nginx
location /api/ {
  proxy_pass https://smeni_backend/;          # https://
  proxy_ssl_server_name on;                   # SNI
  proxy_set_header Host $proxy_host;
  ...
}
location /ws {
  proxy_pass https://smeni_backend/ws;        # https://
  proxy_ssl_server_name on;
  ...
}
```

Проще через **private networking** — там HTTP, без SSL.

---

## Локальная разработка (без Railway)

```bash
# 1. Поднять всё в Docker
docker compose up --build

# Открыть http://localhost:8081
# API: http://localhost:8080
# DB: localhost:5432 (postgres/postgres)
```

Логины по умолчанию:
- Света — `sveta123`
- Мария — `maria123`

Меняются через env-переменные `SVETA_PASSWORD` / `MARIA_PASSWORD`.
