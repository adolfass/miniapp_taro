# 🐛 ОТЧЁТ: Найденные проблемы и предложения по архитектуре

**Версия протокола:** 5.8.0
**Дата:** 2026-03-10
**Приоритет:** 🔴 КРИТИЧНЫЙ
**Статус:** ⏳ ОЖИДАЕТ ОБСУЖДЕНИЯ И ТЕСТИРОВАНИЯ

---

## 🎯 КОНТЕКСТ

**Менеджер провёл ручное тестирование на сервере и нашёл проблемы.**

**Backend (server.js, db.js):** ✅ РАБОТАЕТ ПРАВИЛЬНО
- `isRealOnline()` проверяет правильно (readyDiff > 0)
- Сервер отправляет ping каждые 2 минуты
- Комбинированное меню для админ-таролога реализовано

**Frontend (tarologist-chat.html):** ❌ КРИТИЧЕСКАЯ ПРОБЛЕМА
- Нет обработчика `tarologist-ping`
- Нет отправки `tarologist-pong`
- WebSocket heartbeat НЕ работает → `last_ws_ping` пустой

---

## 🚨 ПРОБЛЕМА 1: WebSocket heartbeat НЕ работает

### Описание:
Таролог подключается через WebSocket, но **НЕ отвечает на ping** сервера.

### Доказательство:
```sql
SELECT id, name, last_ws_ping FROM tarologists;

7|Роман|NULL  ← ПУСТО!
9|D P|NULL    ← ПУСТО!
10|Марианна|NULL ← ПУСТО!
```

### Причина:
В `public/tarologist-chat.html` отсутствует код:
```javascript
// НЕТУ!
socket.on('tarologist-ping', () => {
    socket.emit('tarologist-pong');
});
```

### Где проверить:
- Сервер: `server/server.js:2499` - отправляет ping
- Клиент: `public/tarologist-chat.html:335` - только connect, нет pong

### Решение:
Добавить в `tarologist-chat.html` после `socket.on('connect', ...)`:

```javascript
// Ответ на heartbeat (ping)
socket.on('tarologist-ping', () => {
    socket.emit('tarologist-pong');
    console.log('💓 Отправил pong на сервер');
});
```

### Тест:
```bash
# 1. Исправить файл
# 2. Перезапустить сервер
pm2 restart tarot-app

# 3. Открыть tarologist-chat.html в браузере
# 4. Проверить БД через 2 минуты
sqlite3 /var/www/tarot-miniapp/server/tarot.db "SELECT last_ws_ping FROM tarologists WHERE id = 7;"

# Ожидаемый результат: 2026-03-10T17:XX:XX.Z
```

---

## 🚨 ПРОБЛЕМА 2: Кнопка админки НЕ видна менеджеру

### Описание:
Менеджер (ID 511017697) является **и админом, и тарологом** одновременно.
Видит только кнопку "💰 Для тарологов", но НЕ видит "🔐 Открыть админ-панель".

### Проверка кода:
```bash
# На сервере проверено - код ПРАВИЛЬНЫЙ:
grep -A 20 'if (isAdmin && tarologist)' server/admin-bot.js

# Показывает комбинированное меню
```

### Возможная причина:
- Кэширование бота Telegram
- Менеджер НЕ нажал `/start` после обновления кода

### Решение:
```bash
# 1. Проверить что код на сервере правильный
ssh root@goldtarot.ru "grep -A 30 'if (isAdmin && tarologist)' /var/www/tarot-miniapp/server/admin-bot.js"

# 2. Перезапустить бота
pm2 restart tarot-app

# 3. Менеджеру нажать /start в боте заново
```

---

## 📊 АРХИТЕКТУРНЫЙ АУДИТ

### Текущее состояние:
```
server/server.js        2793 строк  ← 🔴 ОЧЕНЬ БОЛЬШОЙ (монолит)
server/db.js            1082 строк  ← 🟡 СРЕДНИЙ
server/admin-bot.js      757 строк  ← 🟢 НОРМА
public/admin-app/admin.js 976 строк ← 🟢 НОРМА
public/tarologist-chat.html 556 строк ← 🟢 НОРМА
────────────────────────────────────────────────
ВСЕГО:                  6164 строк
```

### Найденные проблемы архитектуры:

#### 1. 🔴 Монолит server.js (2793 строки)

**Проблема:**
```javascript
// Всё в одном файле:
- Express API (500 строк)
- WebSocket handlers (700 строк)
- Telegram Bot (600 строк)
- Payment webhooks (400 строк)
- Auto-refunds cron (200 строк)
- Utility functions (393 строки)
```

**Предложение:**
Разделить на модули:
```
server/
├── index.js                 # Точка входа (100 строк)
├── api/                     # REST API
│   ├── index.js            # Роутер
│   ├── tarologists.js      # /api/tarologists/*
│   ├── payments.js         # /api/payment/*
│   └── chat.js             # /api/chat/*
├── websocket/              # WebSocket
│   ├── index.js           # Socket.IO
│   └── heartbeat.js       # Heartbeat логика
├── bot/                    # Telegram Bot
│   ├── index.js           # Бот
│   ├── commands.js        # Команды
│   └── callbacks.js       # Callbacks
├── workers/                # Фоновые задачи
│   └── auto-refund.js     # Автовозвраты
├── db/                     # База данных
│   └── index.js           # Модели
├── middleware/             # Middleware
│   ├── auth.js            # Telegram auth
│   └── error-handler.js   # Обработка ошибок
└── services/               # Бизнес-логика
    ├── payment-service.js
    └── notification-service.js
```

**Плюсы:**
- ✅ Чёткое разделение ответственности
- ✅ Легко найти код
- ✅ Тестируется по отдельности
- ✅ Деплой одной командой

**Минусы:**
- ⚠️ Нужно 1-2 дня на рефакторинг

---

#### 2. 🔴 Дублирование кода

**Проблема A:** Валидация Telegram initData
```javascript
// server.js:85-105
function validateTelegramData(initData) { ... }

// server.js:1250-1270
function validateInitData(initData) { ... }  ← ДУБЛИКАТ!
```

**Решение:**
```javascript
// utils/validate-telegram.js
export function validateTelegramData(initData) {
  // Единая функция
}

// Импортировать везде:
import { validateTelegramData } from '../utils/validate-telegram.js';
```

**Проблема B:** ADMIN_ID
```javascript
// server.js:45
const ADMIN_ID = process.env.ADMIN_ID;

// admin-bot.js:12
const ADMIN_TELEGRAM_ID = process.env.ADMIN_ID;

// server.js:1500
const adminId = parseInt(process.env.ADMIN_ID);
```

**Решение:**
```javascript
// config/index.js
export const config = {
  adminId: parseInt(process.env.ADMIN_ID),
  botToken: process.env.TELEGRAM_BOT_TOKEN,
};

// Использовать:
import { config } from '../config/index.js';
```

---

#### 3. 🟡 Оптимизация БД запросов

**Проблема:**
```javascript
// 3 запроса вместо 1:
const tarologist = db.prepare('SELECT * FROM tarologists WHERE id = ?').get(id);
const balance = db.prepare('SELECT SUM(amount) FROM payouts WHERE tarologist_id = ?').get(id);
const sessions = db.prepare('SELECT COUNT(*) FROM chat_sessions WHERE tarologist_id = ?').get(id);
```

**Решение:**
```javascript
// 1 запрос с JOIN:
export function getFullProfile(id) {
  return db.prepare(`
    SELECT t.*,
           COALESCE(SUM(p.amount), 0) as balance,
           (SELECT COUNT(*) FROM chat_sessions WHERE tarologist_id = t.id AND active = 1) as active_sessions
    FROM tarologists t
    LEFT JOIN payouts p ON t.id = p.tarologist_id
    WHERE t.id = ?
    GROUP BY t.id
  `).get(id);
}
```

**Экономия:** 3 запроса → 1 запрос

---

#### 4. 🟡 Кэширование API

**Проблема:**
```javascript
// Каждый запрос к API получает данные из БД
app.get('/api/tarologists', (req, res) => {
  const tarologists = Tarologist.getAll();  ← 100 раз/мин
});
```

**Решение:**
```javascript
// middleware/cache.js
const cache = new Map();
const CACHE_TTL = 30 * 1000; // 30 секунд

export function cacheMiddleware(key, ttl = CACHE_TTL) {
  return (req, res, next) => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.time < ttl) {
      return res.json(cached.data);
    }
    res.oldJson = res.json;
    res.json = (data) => {
      cache.set(key, { data, time: Date.now() });
      res.oldJson(data);
    };
    next();
  };
}

// Использование:
app.get('/api/tarologists', cacheMiddleware('tarologists'), (req, res) => {
  const tarologists = Tarologist.getAll();
  res.json(tarologists);
});
```

**Экономия:** 100 запросов/мин → 2 запроса/мин

---

#### 5. 🟡 Логирование

**Проблема:**
```javascript
console.log('✅ Платёж успешен');
console.error('❌ Ошибка:', error);
```

**Решение:**
```javascript
// utils/logger.js (winston)
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log' })
  ]
});

// Использование:
logger.info('Payment successful', { transactionId, userId });
logger.error('Payment failed', { error: error.message });
```

**Плюсы:**
- ✅ JSON формат (парсится машинами)
- ✅ Уровни логирования
- ✅ Отдельные файлы для ошибок

---

## 🔧 ПЛАН ДЕЙСТВИЙ

### СРОЧНО (сегодня):

1. **Исправить WebSocket heartbeat**
   - Добавить `socket.on('tarologist-ping')` в tarologist-chat.html
   - Протестировать что `last_ws_ping` обновляется

2. **Проверить кнопку админки**
   - Менеджеру нажать `/start` в боте
   - Проверить что видит обе кнопки

### БЛИЖАЙШАЯ НЕДЕЛЯ:

3. **Добавить logger** (winston)
4. **Добавить errorHandler** (централизованный)
5. **Убрать дублирование validateTelegramData**
6. **Добавить config/index.js**

### СЛЕДУЮЩАЯ НЕДЕЛЯ:

7. **Разделить server.js на модули**
8. **Оптимизировать БД запросы**
9. **Добавить кэширование API**

---

## 📊 ОТЧЁТ

**Обсудите с менеджером и протестируйте:**

```markdown
---

# ✅ ОТЧЁТ: Исправление WebSocket + обсуждение архитектуры

**Версия протокола:** 5.8.1
**Дата:** 2026-03-10
**Статус:** ⏳ НА ТЕСТИРОВАНИИ

---

## Исправлено:

| Проблема | Статус | Тест |
|----------|--------|------|
| WebSocket heartbeat | ✅/❌ | last_ws_ping обновляется |
| Кнопка админки | ✅/❌ | Менеджер видит обе кнопки |

---

## Обсуждение архитектуры:

**Менеджер + Агент обсудили:**

1. **Модульная архитектура:** ✅ ЗА / ❌ ПРОТИВ
   - Аргументы ЗА:
   - Аргументы ПРОТИВ:

2. **Logger (winston):** ✅ ЗА / ❌ ПРОТИВ

3. **Кэширование:** ✅ ЗА / ❌ ПРОТИВ

4. **Оптимизация БД:** ✅ ЗА / ❌ ПРОТИВ

---

## Решение:

**Что делаем:**
- [ ] Исправить WebSocket (СРОЧНО)
- [ ] Добавить logger
- [ ] Разделить server.js
- [ ] Другое: ...

**Что НЕ делаем:**
- [ ] Микросервисы (оверкилл)
- [ ] Docker/K8s
- [ ] GraphQL

---

## Итог:

**WebSocket работает:** ✅/❌
**Архитектура утверждена:** ✅/❌
**Готовы к рефакторингу:** ✅/❌

---

**Выполнил:** Opencode Agent (SRE/DevOps)
**Сервер:** goldtarot.ru
**Статус:** 🟢 ONLINE

---

*Дата: 2026-03-10*
```

---

## ⏳ ЖДУ ОБСУЖДЕНИЯ С МЕНЕДЖЕРОМ

**Менеджер и агент должны:**
1. Протестировать исправление WebSocket
2. Обсудить каждое предложение по архитектуре
3. Принять решение что делаем, что нет
4. Написать отчёт с решением

**После обсуждения:**
```bash
cd /var/www/tarot-miniapp
git add exchange/REPORT_TO_QWEN.md
git commit -m "docs: обсуждение архитектуры и тестирование WebSocket"
git push origin main
```

---

*Дата: 2026-03-10*
*Приоритет: 🔴 КРИТИЧНЫЙ (WebSocket)*
*Версия протокола: 5.8.0*
