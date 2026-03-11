# 🔧 РЕФАКТОРИНГ: server.js → модульная архитектура

**Версия протокола:** 5.9.3
**Дата:** 2026-03-11
**Приоритет:** 🟡 СРЕДНИЙ
**Статус:** ⏳ ОЖИДАЕТ ВЫПОЛНЕНИЯ

---

## 🎯 ЗАДАЧА

**Разделить server.js (2793 строки) на модули:**

```
server/
├── index.js                 # Точка входа
├── api/
│   ├── index.js            # Роутер
│   ├── tarologists.js      # Тарологи API
│   ├── payments.js         # Платежи API
│   └── chat.js             # Чат API
├── websocket/
│   └── index.js           # WebSocket + heartbeat
├── bot/
│   └── webhook.js         # Webhook handler
├── middleware/
│   ├── auth.js            # Auth middleware
│   ├── auto-close.js      # Auto-close sessions
│   └── error-handler.js   # Error handler
└── services/
    └── payment-service.js # Payment service
```

---

## 📋 ПОШАГОВАЯ ИНСТРУКЦИЯ

### Шаг 1: Создать middleware

**Файл:** `middleware/auth.js`
```javascript
// Вынести из server.js (строки ~70-100)
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export function validateTelegramData(initData) {
  if (!initData) return false;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();

  const computedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return computedHash === hash;
}

export function isAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  if (!validateTelegramData(initData)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
```

---

**Файл:** `middleware/auto-close.js`
```javascript
// Вынести из server.js (~строки 882-894)
import db, { ChatSession } from '../db.js';

export function autoCloseSessions(req, res, next) {
  try {
    ChatSession.autoCloseOldSessions();
    next();
  } catch (error) {
    next();
  }
}
```

---

**Файл:** `middleware/error-handler.js`
```javascript
// Вынести обработку ошибок из server.js
export function errorHandler(err, req, res, next) {
  console.error(err.message, { stack: err.stack });
  
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  
  res.status(500).json({ error: 'Internal server error' });
}

export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}
```

---

### Шаг 2: Создать services

**Файл:** `services/payment-service.js`
```javascript
// Вынести логику платежей из server.js
import db, { Transaction, Tarologist, Payout } from '../db.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const IS_TEST_MODE = process.env.TEST_MODE === 'true';

export async function createInvoice(userId, tarologistId, starsAmount) {
  // Логика создания инвойса из server.js
}

export async function processPayment(transactionData) {
  // Логика обработки платежа
}

export async function refund(transactionId, reason) {
  // Логика возврата
}

export function calculateDistribution(starsAmount) {
  const platformCut = Math.round(starsAmount * 0.1);
  const tarologistCut = starsAmount - platformCut;
  return { platformCut, tarologistCut };
}
```

---

### Шаг 3: Создать API роутеры

**Файл:** `api/tarologists.js`
```javascript
// Вынести из server.js все /api/tarologists/*
import express from 'express';
import db from '../db.js';
import { isAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/tarologists
router.get('/', (req, res) => {
  const tarologists = db.prepare('SELECT * FROM tarologists WHERE is_active = 1').all();
  res.json({ success: true, data: tarologists });
});

// GET /api/tarologist/:id
router.get('/:id', (req, res) => {
  const tarologist = db.prepare('SELECT * FROM tarologists WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: tarologist });
});

// GET /api/tarologist/:id/status
router.get('/:id/status', (req, res) => {
  // Логика статуса
});

// POST /api/tarologist/:id/heartbeat
router.post('/:id/heartbeat', (req, res) => {
  // Heartbeat логика
});

// POST /api/tarologist/:id/ready
router.post('/:id/ready', (req, res) => {
  // Ready логика
});

export default router;
```

---

**Файл:** `api/payments.js`
```javascript
// Вынести все /api/payment/* и /api/create-invoice
import express from 'express';
import { createInvoice, processPayment } from '../services/payment-service.js';
import { isAuth } from '../middleware/auth.js';

const router = express.Router();

// POST /api/create-invoice
router.post('/create-invoice', isAuth, async (req, res) => {
  const { tarologistId, userId } = req.body;
  const invoice = await createInvoice(userId, tarologistId);
  res.json({ success: true, data: invoice });
});

// POST /api/payment-webhook
router.post('/payment-webhook', async (req, res) => {
  const paymentData = req.body;
  await processPayment(paymentData);
  res.json({ success: true });
});

export default router;
```

---

**Файл:** `api/chat.js`
```javascript
// Вынести все /api/chat/* и /api/session/*
import express from 'express';
import db, { ChatSession, Message } from '../db.js';
import { isAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/session/:id/status
router.get('/session/:id/status', (req, res) => {
  const session = ChatSession.getById(req.params.id);
  res.json({ success: true, data: session });
});

// POST /api/session/:id/rate
router.post('/session/:id/rate', isAuth, async (req, res) => {
  const { rating, comment } = req.body;
  await ChatSession.submitRating(req.params.id, rating, comment);
  res.json({ success: true });
});

// GET /api/chat/session/:id/messages
router.get('/chat/session/:id/messages', isAuth, (req, res) => {
  const messages = Message.getBySession(req.params.id);
  res.json({ success: true, data: messages });
});

export default router;
```

---

**Файл:** `api/admin.js`
```javascript
// Вынести все /api/admin/*
import express from 'express';
import db, { Tarologist, Transaction, Payout } from '../db.js';

const router = express.Router();

// GET /api/admin/tarologists
router.get('/tarologists', (req, res) => {
  const tarologists = db.prepare('SELECT * FROM tarologists').all();
  res.json({ success: true, data: tarologists });
});

// GET /api/admin/transactions
router.get('/transactions', (req, res) => {
  const transactions = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all();
  res.json({ success: true, data: transactions });
});

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  // Статистика
});

export default router;
```

---

**Файл:** `api/index.js`
```javascript
// Роутер для всех API
import express from 'express';
import tarologistsRouter from './tarologists.js';
import paymentsRouter from './payments.js';
import chatRouter from './chat.js';
import adminRouter from './admin.js';

const router = express.Router();

router.use('/tarologists', tarologistsRouter);
router.use('/payment', paymentsRouter);
router.use('/chat', chatRouter);
router.use('/admin', adminRouter);

export default router;
```

---

### Шаг 4: Создать WebSocket

**Файл:** `websocket/index.js`
```javascript
// Вынести WebSocket логику из server.js
import db, { Tarologist } from '../db.js';

export function initWebSocket(io) {
  io.on('connection', (socket) => {
    console.log('Клиент подключился:', socket.id);

    // Tarologist connect
    socket.on('tarologist-connect', (data) => {
      const { tarologistId, initData } = data;
      
      // Валидация
      // Обновление статуса
      
      socket.emit('tarologist-status', {
        is_online: true,
        last_ws_ping: new Date().toISOString()
      });

      // Heartbeat interval
      const pingInterval = setInterval(() => {
        if (socket.connected) {
          socket.emit('tarologist-ping');
        }
      }, 2 * 60 * 1000);

      socket.data.pingInterval = pingInterval;
    });

    // Tarologist pong
    socket.on('tarologist-pong', () => {
      if (socket.data.tarologistId) {
        Tarologist.wsHeartbeat(socket.data.tarologistId);
      }
    });

    // Chat session
    socket.on('join-session', (data) => {
      const { sessionId, userId, userType } = data;
      socket.join(`session_${sessionId}`);
    });

    // Messages
    socket.on('send-message', (data) => {
      // Логика сообщений
    });

    socket.on('disconnect', () => {
      console.log('Клиент отключился:', socket.id);
    });
  });
}
```

---

### Шаг 5: Создать Bot Webhook

**Файл:** `bot/webhook.js`
```javascript
// Вынести обработку webhook из server.js
import db, { Tarologist, Transaction, ChatSession } from '../db.js';
import adminBot from './admin-bot.js';

export async function handleWebhook(update) {
  console.log('🔍 BOT: Received webhook update');

  // Обработка сообщений
  if (update.message) {
    if (update.message.successful_payment) {
      await handleSuccessfulPayment(update.message);
    }
  }

  // Обработка callback
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
  }
}

async function handleSuccessfulPayment(message) {
  // Логика успешной оплаты
}

async function handleCallbackQuery(query) {
  // Логика callback
}

export default { handleWebhook };
```

---

### Шаг 6: Создать index.js

**Файл:** `index.js` (точка входа)
```javascript
/**
 * Tarot Mini App Server
 * Модульная архитектура v5.9.3
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import db, { initializeTestData } from './db.js';
import apiRouter from './api/index.js';
import { initWebSocket } from './websocket/index.js';
import { handleWebhook } from './bot/webhook.js';
import { autoCloseSessions } from './middleware/auto-close.js';
import { errorHandler } from './middleware/error-handler.js';
import adminBot from './admin-bot.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json());
app.use(autoCloseSessions);

// API
app.use('/api', apiRouter);

// Bot webhook
app.post('/api/bot/webhook', (req, res) => {
  handleWebhook(req.body);
  res.json({ ok: true });
});

// Error handler
app.use(errorHandler);

// WebSocket
initWebSocket(io);

// Start
initializeTestData();
adminBot.startBot();

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export { app, io, httpServer };
```

---

## ✅ ПРОВЕРКИ ПОСЛЕ РЕФАКТОРИНГА

### 1. Запуск сервера:
```bash
cd /var/www/tarot-miniapp/server
node index.js

# Ожидаемый результат:
# 🚀 Server running on port 3001
# 🤖 Admin bot polling started
```

### 2. Проверка API:
```bash
# Тарологи
curl -s https://goldtarot.ru/api/tarologists | jq '.success'
# Ожидается: true

# Статус
curl -s https://goldtarot.ru/api/tarologist/7/status | jq '.success'
# Ожидается: true
```

### 3. Проверка WebSocket:
```bash
# Логи WebSocket
tail -50 /tmp/server.log | grep -i websocket
```

### 4. Проверка БД:
```bash
sqlite3 server/tarot.db "SELECT COUNT(*) FROM transactions;"
```

---

## 📊 ОТЧЁТ

**Напиши в `exchange/REFACTORING_REPORT.md`:**

```markdown
# ✅ ОТЧЁТ: Рефакторинг server.js

**Версия протокола:** 5.9.4
**Дата:** 2026-03-11
**Статус:** ✅ ВЫПОЛНЕНО

---

## Что сделано:

| Файл | Строк | Описание |
|------|-------|----------|
| index.js | ~100 | Точка входа |
| api/index.js | ~50 | Роутер |
| api/tarologists.js | ~200 | Тарологи API |
| api/payments.js | ~150 | Платежи API |
| api/chat.js | ~150 | Чат API |
| api/admin.js | ~150 | Админка API |
| websocket/index.js | ~200 | WebSocket |
| bot/webhook.js | ~200 | Webhook |
| middleware/*.js | ~150 | Middleware |
| services/payment-service.js | ~200 | Payment service |

**Итого:** 2793 строки → ~1500 строк (разделены)

---

## Проверки:

- [ ] Сервер запускается ✅
- [ ] API работают ✅
- [ ] WebSocket подключается ✅
- [ ] Webhook обрабатывается ✅
- [ ] БД цела ✅

---

## Итог:

**Рефакторинг завершён:** ✅
**Все тесты пройдены:** ✅
**Готово к тестированию оплаты:** ✅

---

**Выполнил:** Opencode Agent
**Время:** ~1-2 часа
```

---

## ⏳ ЖДУ ВЫПОЛНЕНИЯ

**После рефакторинга:**
1. Написать отчёт в `exchange/REFACTORING_REPORT.md`
2. Запушить на GitHub
3. Продолжить тестирование оплаты

---

*Дата: 2026-03-11*
*Приоритет: 🟡 СРЕДНИЙ*
*Версия протокола: 5.9.3*
