## Архитектурное решение для административной панели Tarot Mini App

### 1. Общий обзор
Административная панель реализуется как отдельное Mini App внутри Telegram, доступное только администратору бота. Она будет использовать существующий бэкенд на Node.js/Express и БД SQLite, расширяя их новыми таблицами и эндпоинтами. Фронтенд выполнен на чистом HTML/CSS/JS с использованием Chart.js для визуализации метрик.

### 2. Компоненты архитектуры (C4)

#### Контекст
- **Пользователь-администратор** — взаимодействует через Telegram (кнопка в боте)
- **Tarot Mini App (основное)** — генерирует события
- **Admin Mini App** — панель управления
- **Backend** — Express-сервер с API
- **SQLite Database** — хранит все данные
- **Telegram Bot API** — используется для получения информации о тарологах

#### Контейнеры
1. **Frontend (Admin SPA)** — статические файлы, обслуживаемые через nginx (или Express)
2. **Backend API** — Node.js/Express, обрабатывает запросы от обоих Mini App
3. **Database** — SQLite (файл `/var/www/tarot-miniapp/server/tarot.db`)
4. **Telegram Bot** — тот же бот, обрабатывает команды и webhook

#### Компоненты Backend (новые модули)
- **authMiddleware** — проверка initData и прав администратора
- **trackController** — обработка событий от основного приложения
- **statsController** — расчёт всех метрик (DAU, retention, воронка и т.д.)
- **tarologistController** — CRUD для тарологов + интеграция с Telegram API
- **payoutController** — управление выплатами и возвратами
- **transactionController** — работа с транзакциями (возвраты)

### 3. Расширение базы данных

#### Таблица `events` (новая)
```sql
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT,           -- JSON (например, { spread_type: 'daily' })
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_events_user ON events(user_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_created ON events(created_at);
```

**Типы событий**:
- `app_open` – запуск приложения
- `spread_selected` – выбор расклада (в event_data: `{ spread_type: 'daily'|'path' }`)
- `cards_flipped` – переворот всех карт (можно добавить количество)
- `payment_initiated` – инициирована оплата
- `payment_completed` – оплата завершена
- `consultation_requested` – запрос консультации

#### Дополнительные поля в существующих таблицах (если нужно)
В таблице `users` уже есть всё необходимое. В `transactions` уже есть поля для комиссий – отлично.

### 4. API Endpoints (все требуют valid initData и прав администратора)

#### 4.1. Отслеживание событий (публичный)
- `POST /api/track` – принимает { event_type, event_data } (initData в заголовке)

#### 4.2. Статистика
- `GET /admin/stats/dau?days=30` – массив { date, value }
- `GET /admin/stats/wau?weeks=12` – массив { week_start, value }
- `GET /admin/stats/mau?months=12` – массив { month, value }
- `GET /admin/stats/retention?cohort_day=0&period_days=30` – удержание для всех когорт или конкретной
- `GET /admin/stats/session-length?from=...&to=...` – средняя длина сессии
- `GET /admin/stats/conversion?target=payment_completed` – конверсия в целевое действие
- `GET /admin/stats/funnel?steps=app_open,spread_selected,payment_completed` – воронка
- `GET /admin/stats/ltv` – средний LTV (доход на пользователя)
- `GET /admin/stats/revenue/monthly` – { total_stars, commission_10%, admin_share }
- `GET /admin/stats/top-tarologists?limit=3` – список тарологов с доходом и кол-вом консультаций

#### 4.3. Управление тарологами
- `GET /admin/tarologists` – список всех тарологов (с балансом)
- `POST /admin/tarologists` – { telegram_id } → сервер через `bot.telegram.getChat` получает имя, фото, сохраняет
- `DELETE /admin/tarologists/:id` – удаление
- `GET /admin/tarologists/:id` – детальная информация
- `PUT /admin/tarologists/:id` – обновление описания (description)

#### 4.4. Выплаты
- `GET /admin/payouts?tarologist_id=...&status=...` – список выплат
- `POST /admin/payouts` – { tarologist_id, amount, notes } (статус "pending")
- `PUT /admin/payouts/:id/complete` – отметить как выполненную (статус "completed")
- `PUT /admin/payouts/:id/cancel` – отменить (если статус "pending")

#### 4.5. Возвраты транзакций
- `GET /admin/transactions/refundable` – список транзакций со статусом "pending" или по запросу (можно добавить поле `refund_requested` в `transactions`)
- `POST /admin/transactions/:id/refund` – { reason } → меняет статус на "refunded", записывает причину

### 5. Безопасность

#### Middleware для проверки администратора
```javascript
const ADMIN_IDS = process.env.ADMIN_IDS.split(','); // "123456,789012"

async function adminOnly(req, res, next) {
    try {
        const initData = req.headers['x-telegram-init-data'];
        if (!initData) return res.status(401).json({ error: 'Unauthorized' });

        const user = await validateTelegramWebAppData(initData); // своя функция
        if (!user || !ADMIN_IDS.includes(user.id.toString())) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        req.telegramUser = user;
        next();
    } catch (e) {
        res.status(401).json({ error: 'Invalid auth' });
    }
}
```

#### Валидация initData
- Использовать стандартный алгоритм проверки HMAC-SHA256 с токеном бота (секрет).

#### Хранение секретов
- Все ключи в `.env`, файл не попадает в репозиторий.
- На сервере права доступа 600.

### 6. Фронтенд админ-панели

Структура папок (в `public/admin`):
```
public/admin/
├── index.html
├── css/
│   └── admin.css (наследует стили основного приложения)
├── js/
│   └── admin.js (логика вкладок, загрузка данных, Chart.js)
└── libs/ (Chart.js, можно через CDN)
```

**Функциональность**:
- Три вкладки: Статистика, Тарологи, Выплаты.
- Во вкладке "Статистика" графики DAU/WAU/MAU, Retention, воронка, общий доход, топ-тарологи.
- Во вкладке "Тарологи" форма добавления, список с возможностью удаления.
- Во вкладке "Выплаты" форма создания выплаты, список выплат, раздел "Возвраты" с формой.

Все запросы к API отправляются с заголовком `X-Telegram-Init-Data`, содержащим `window.Telegram.WebApp.initData`.

### 7. План реализации (для агентов)

#### 7.1. Задачи для Qwen code (программист)
1. **Создать миграцию БД**: добавить таблицу `events`.
2. **Реализовать трекинг событий**:
   - Эндпоинт `POST /api/track`
   - Интеграция в основное приложение: вызов `trackEvent` при каждом действии.
3. **Реализовать middleware `adminOnly`** и добавить ко всем эндпоинтам `/admin/*`.
4. **Реализовать все эндпоинты статистики** (сложные SQL-запросы, но можно начать с простых, затем оптимизировать).
5. **Реализовать CRUD для тарологов** с вызовом Telegram API (метод `getChat`).
6. **Реализовать эндпоинты для выплат и возвратов**.
7. **Написать фронтенд админки**:
   - HTML с вкладками
   - CSS (адаптация основного стиля)
   - JS с использованием Chart.js и fetch
8. **Написать юнит-тесты** для ключевых эндпоинтов (использовать Jest или Mocha).
9. **Обновить README** с новыми переменными окружения и инструкцией.

#### 7.2. Задачи для Open code (devops)
1. **Обновить код на сервере** после пуша на GitHub.
2. **Установить новые зависимости** (если появятся).
3. **Перезапустить приложение** (pm2 restart).
4. **Проверить логи** на наличие ошибок.
5. **Протестировать доступность админки** по URL и убедиться, что доступ только у админа.
6. **При необходимости настроить nginx** для корректной маршрутизации.

### 8. Дорожная карта

| Этап | Длительность | Ответственный |
|------|--------------|---------------|
| 1. Добавление таблицы events и трекинг | 1 день | Qwen code |
| 2. Реализация статистических эндпоинтов | 2 дня | Qwen code |
| 3. CRUD тарологов + интеграция с Telegram | 1 день | Qwen code |
| 4. Выплаты и возвраты | 1 день | Qwen code |
| 5. Фронтенд админки | 2 дня | Qwen code |
| 6. Тестирование и доработка | 1 день | Qwen code |
| 7. Деплой и проверка на сервере | 0.5 дня | Open code |

### 9. Риски и их mitigation
- **Сложность расчёта retention и воронки на SQLite**: Можно использовать несколько запросов и агрегацию в коде. При росте данных перейти на предрасчётные таблицы.
- **Безопасность initData**: Тщательно реализовать проверку HMAC, не доверять клиенту.
- **Зависимость от Telegram API при добавлении тарологов**: Обрабатывать ошибки (если пользователь не найден или бот не имеет доступа).

### 10. Заключение
Предложенная архитектура полностью соответствует требованиям, легковесна и безопасна. Используются уже знакомые технологии (Node.js, SQLite, Telegram API), что минимизирует риски. Админ-панель будет интегрирована в существующий проект без ломки текущей функциональности.