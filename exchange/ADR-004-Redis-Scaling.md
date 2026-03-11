# ADR-004: Масштабирование с Redis для очередей сообщений

## Статус
Proposed (Предложено для будущей реализации)

## Контекст

При текущей архитектуре (SQLite + Webhook) существует риск потери сообщений при перезапуске сервера:

- Telegram ретраит webhook только 3 раза с интервалами
- При downtime > 60 секунд сообщения могут быть потеряны
- Нет persistence очереди между получением webhook и обработкой
- Нет механизма гарантированной доставки

## Решение

### Архитектура с Redis + Bull Queue

```
┌─────────────────────────────────────────────────────────────┐
│                      Telegram API                           │
└──────────────────────┬──────────────────────────────────────┘
                       │ Webhook POST
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Express Server (Node.js)                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Webhook Handler (bot/webhook.js)                   │   │
│  │  - Принимает запрос                                 │   │
│  │  - Помещает в очередь Redis                         │   │
│  │  - Отвечает 200 OK Telegram                         │   │
│  └────────────────────┬────────────────────────────────┘   │
└───────────────────────┼─────────────────────────────────────┘
                        │ LPUSH
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Redis Server                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Queues:                                            │   │
│  │  - payments:queue    (оплаты)                       │   │
│  │  - messages:queue    (сообщения бота)               │   │
│  │  - notifications:queue (уведомления)                │   │
│  └────────────────────┬────────────────────────────────┘   │
└───────────────────────┼─────────────────────────────────────┘
                        │ BRPOP / Process
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Worker Processes (Bull Queue)                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Processors:                                        │   │
│  │  1. PaymentProcessor                                │   │
│  │     - Обработка платежей                            │   │
│  │     - Создание сессий                               │   │
│  │     - Уведомления тарологам                         │   │
│  │                                                     │   │
│  │  2. MessageProcessor                                │   │
│  │     - Команды бота                                  │   │
│  │     - Callback queries                              │   │
│  │                                                     │   │
│  │  3. NotificationProcessor                           │   │
│  │     - Email уведомления                             │   │
│  │     - Push уведомления                              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Почему Bull Queue (BullMQ)

**Bull** vs **BullMQ** vs **Bee Queue**:

| Фича | Bull | BullMQ | Bee Queue |
|------|------|--------|-----------|
| **Redis** | Да | Да | Да |
| **TypeScript** | Нет | Да | Да |
| **Rate Limiting** | Да | Да | Нет |
| **Job Progress** | Да | Да | Да |
| **Scheduled Jobs** | Да | Да | Нет |
| **Atomic Ops** | Lua | Lua | Нет |
| **Priority** | Да | Да | Да |
| **Поддержка** | Старая | Активная | Минимальная |

**Выбор:** BullMQ для новых проектов (TypeScript, активная поддержка)

## Реализация (Future)

### 1. Установка

```bash
npm install bullmq ioredis
```

### 2. Redis Connection

```javascript
// config/redis.js
import { Redis } from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  db: 0,
  retryStrategy: (times) => {
    return Math.min(times * 50, 2000);
  }
});
```

### 3. Queue Definitions

```javascript
// queues/index.js
import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';

// Очередь платежей
export const paymentsQueue = new Queue('payments', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  }
});

// Очередь сообщений бота
export const messagesQueue = new Queue('messages', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'fixed',
      delay: 2000
    }
  }
});

// Очередь уведомлений
export const notificationsQueue = new Queue('notifications', {
  connection: redis
});
```

### 4. Webhook Handler (обновлённый)

```javascript
// bot/webhook.js
import { paymentsQueue, messagesQueue } from '../queues/index.js';

export async function handleWebhook(update) {
  console.log('🔍 BOT: Received webhook update');
  
  try {
    // Успешный платёж → очередь
    if (update.message?.successful_payment) {
      await paymentsQueue.add('process-payment', {
        type: 'successful_payment',
        data: update.message.successful_payment,
        userId: update.message.from.id,
        timestamp: Date.now()
      }, {
        jobId: `payment-${update.message.successful_payment.telegram_payment_charge_id}`,
        priority: 10 // Высокий приоритет
      });
      
      // Отвечаем Telegram мгновенно
      return { ok: true, queued: true };
    }
    
    // Команды бота → очередь
    if (update.message?.text?.startsWith('/')) {
      await messagesQueue.add('process-command', {
        type: 'command',
        command: update.message.text,
        chatId: update.message.chat.id,
        userId: update.message.from.id
      });
      
      return { ok: true, queued: true };
    }
    
    // Callback queries → очередь
    if (update.callback_query) {
      await messagesQueue.add('process-callback', {
        type: 'callback',
        data: update.callback_query.data,
        chatId: update.callback_query.message.chat.id,
        userId: update.callback_query.from.id
      });
      
      return { ok: true, queued: true };
    }
    
  } catch (error) {
    console.error('Error queueing webhook:', error);
    // Если не удалось добавить в очередь, возвращаем ошибку
    // Telegram ретраит webhook
    throw error;
  }
}
```

### 5. Worker Processes

```javascript
// workers/payment-worker.js
import { Worker } from 'bullmq';
import { redis } from '../config/redis.js';
import { processPayment } from '../services/payment-service.js';

const paymentWorker = new Worker('payments', async (job) => {
  console.log(`💰 Processing payment job ${job.id}`);
  
  try {
    const result = await processPayment(job.data);
    
    // Обновляем прогресс
    await job.updateProgress(50);
    
    // Отправляем уведомление тарологу
    await notifyTarologist(result.tarologistId, result);
    
    await job.updateProgress(100);
    
    return { success: true, result };
    
  } catch (error) {
    console.error(`Payment job ${job.id} failed:`, error);
    throw error; // Bull повторит попытку
  }
}, {
  connection: redis,
  concurrency: 5, // Обрабатывать 5 платежей параллельно
  limiter: {
    max: 10,      // Максимум 10 задач
    duration: 1000 // за 1 секунду
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await paymentWorker.close();
  process.exit(0);
});
```

### 6. Monitoring UI

```javascript
// Optional: Bull Board для мониторинга очередей
import { createBullBoard } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(paymentsQueue),
    new BullMQAdapter(messagesQueue),
    new BullMQAdapter(notificationsQueue)
  ],
  serverAdapter
});

app.use('/admin/queues', serverAdapter.getRouter());
```

### 7. Docker Compose для Redis

```yaml
# docker-compose.redis.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: tarot-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    restart: unless-stopped
    
  redis-commander:
    image: rediscommander/redis-commander:latest
    environment:
      - REDIS_HOSTS=local:redis:6379
    ports:
      - "8081:8081"
    depends_on:
      - redis

volumes:
  redis-data:
```

## Сравнение: SQLite vs Redis

| Критерий | Текущее (SQLite) | С Redis |
|----------|------------------|---------|
| **Persistence очереди** | Нет | Да (Redis AOF) |
| **Гарантия доставки** | 3 ретрая от Telegram | Persistence + ретраи |
| **Обработка при downtime** | До 60 секунд | Неограниченно |
| **Параллельность** | Ограничена | Масштабируема |
| **Rate limiting** | Нет | Встроено |
| **Monitoring** | Нет | Bull Board |
| **Priority queues** | Нет | Да |
| **Scheduled jobs** | Нет | Да |
| **Сложность** | Низкая | Средняя |
| **Инфраструктура** | Только SQLite | + Redis сервер |

## Когда внедрять

**Сейчас (SQLite):**
- ✅ < 10 транзакций в минуту
- ✅ Один сервер
- ✅ Допустимы редкие потери (3-5%)
- ✅ Простота важнее надёжности

**Redis (Future):**
- 🚀 > 50 транзакций в минуту
- 🚀 Несколько серверов
- 🚀 Требуется 99.99% доставка
- 🚀 Нужна приоритизация платежей
- 🚀 Scheduled jobs (напоминания)

## Миграция

### Этап 1: Подготовка (1-2 дня)
1. Установить Redis
2. Создать очереди
3. Обновить webhook handler

### Этап 2: Dual Mode (1 неделя)
1. Записывать в очередь И обрабатывать сразу
2. Мониторинг - сравнение результатов
3. Откат при проблемах

### Этап 3: Полный переход
1. Убрать immediate processing
2. Оставить только очередь
3. Мониторинг Bull Board

## Риски

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Потеря данных Redis | Низкая | Высокое | AOF persistence + backup |
| Сложность | Средняя | Среднее | Постепенная миграция |
| Задержки | Низкая | Среднее | Мониторинг latency |
| Memory limits | Средняя | Высокое | maxmemory-policy |

## Заключение

**Рекомендация:** Внедрить Redis + BullMQ при достижении:
- 1000+ пользователей в день
- 100+ транзакций в день
- Требования 99.9% uptime
- Необходимость scheduled jobs

**Текущее решение (SQLite) adequate для:**
- Текущей нагрузки (10-50 пользователей/день)
- MVP стадии
- Ограниченного бюджета

---

**Статус:** Proposed
**Priority:** Low (для текущей нагрузки)
**Complexity:** Medium
**Est. Effort:** 2-3 дня
