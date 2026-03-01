# 🧪 Payment Testing Instructions for Opencode Agent

## 📋 Обзор задачи

**Задача:** Протестировать интеграцию Telegram Stars оплаты на продакшен сервере.

**Сервер:** VDS `89.125.59.117` (goldtarot.ru)

**Менеджер:** Qwen Code (на макбуке)

---

## 🎯 Цель тестирования

Проверить полный цикл оплаты через Telegram Stars:
1. Выбор таролога
2. Создание инвойса
3. Оплата (тестовые звёзды)
4. Начало чата
5. Работа таймера
6. Оценка таролога

---

## 📝 Предварительные требования

### 1. Telegram Bot Token

Получите токен у @BotFather:
```bash
# Если токен ещё не настроен
cd /var/www/tarot-miniapp/server
nano .env
```

Добавьте:
```bash
TELEGRAM_BOT_TOKEN=<ваш токен>
TELEGRAM_PROVIDER_TOKEN=STARS
```

### 2. Проверка сервера

```bash
# Статус PM2
pm2 status

# Должно быть:
# ┌────┬───────────────┬──────────┤
# │ id │ name          │ status   │
# ├────┼───────────────┼──────────┤
# │ 0  │ tarot-server  │ online   │
# └────┴───────────────┴──────────┘

# Статус Nginx
systemctl status nginx

# Проверка API
curl https://goldtarot.ru/api/tarologists
```

---

## 🚀 Пошаговый сценарий тестирования

### Шаг 1: Проверка текущего состояния

```bash
# 1. Перейдите в директорию проекта
cd /var/www/tarot-miniapp

# 2. Проверьте последнюю версию
git log --oneline -3

# 3. Проверьте статус сервера
pm2 status tarot-server

# 4. Проверьте логи
pm2 logs tarot-server --lines 20
```

**Отчёт Qwen Code:**
```
[TEST REPORT - Step 1]
Status: ✅ READY
Git version: <hash>
PM2 status: online
Issues: none
```

---

### Шаг 2: Проверка .env конфигурации

```bash
# Проверка .env файла
cat /var/www/tarot-miniapp/server/.env

# Проверка наличия токена
grep TELEGRAM_BOT_TOKEN /var/www/tarot-miniapp/server/.env
```

**Ожидаемый результат:**
```bash
TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
TELEGRAM_PROVIDER_TOKEN=STARS
TELEGRAM_WEBHOOK_URL=https://goldtarot.ru/api/payment-webhook
PORT=3001
```

**Отчёт Qwen Code:**
```
[TEST REPORT - Step 2]
.env configured: ✅
BOT_TOKEN: set (masked)
PROVIDER_TOKEN: STARS
WEBHOOK_URL: https://goldtarot.ru/api/payment-webhook
```

---

### Шаг 3: Проверка вебхука Telegram

```bash
# Получите токен из .env
TOKEN=$(grep TELEGRAM_BOT_TOKEN /var/www/tarot-miniapp/server/.env | cut -d'=' -f2)

# Проверка вебхука
curl -s "https://api.telegram.org/bot$TOKEN/getWebhookInfo" | jq .
```

**Ожидаемый ответ:**
```json
{
  "ok": true,
  "result": {
    "url": "https://goldtarot.ru/api/payment-webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": 0,
    "last_error_message": ""
  }
}
```

**Если вебхук не установлен:**
```bash
curl -X POST "https://api.telegram.org/bot$TOKEN/setWebhook?url=https://goldtarot.ru/api/payment-webhook"
```

**Отчёт Qwen Code:**
```
[TEST REPORT - Step 3]
Webhook URL: https://goldtarot.ru/api/payment-webhook
Webhook status: ✅ OK
Pending updates: 0
Last error: none
```

---

### Шаг 4: Проверка API эндпоинтов

```bash
# 1. Проверка списка тарологов
curl -s https://goldtarot.ru/api/tarologists | jq .

# 2. Проверка админки (если есть токен)
curl -s https://goldtarot.ru/api/admin/stats | jq .

# 3. Проверка WebSocket
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     "https://goldtarot.ru/socket.io/?EIO=4&transport=polling"
```

**Ожидаемый результат:**
- `/api/tarologists` → JSON массив с тарологами
- `/api/admin/stats` → статистика (если авторизован)
- `/socket.io` → WebSocket подключён

**Отчёт Qwen Code:**
```
[TEST REPORT - Step 4]
API /api/tarologists: ✅ OK (N tarologists)
API /api/admin/stats: ✅ OK
WebSocket: ✅ Connected
```

---

### Шаг 5: Тестирование в Telegram (ручное)

**Инструкция для менеджера:**

1. Откройте Telegram на ПК или телефоне
2. Найдите бота: `@<your_bot_name>`
3. Нажмите `/start` или Menu Button
4. Откройте Web App: `https://goldtarot.ru`
5. Сделайте расклад (ежедневный или «Путь»)
6. Нажмите «Поделиться с тарологом»
7. Выберите таролога
8. Нажмите «Оплатить»
9. Подтвердите оплату (тестовые звёзды)
10. Проверьте чат (таймер 25 мин)

**Opencode Agent мониторит логи:**
```bash
# Логи сервера в реальном времени
pm2 logs tarot-server --lines 100

# Логи Nginx
tail -f /var/log/nginx/access.log | grep -E "POST|payment"
```

**Отчёт Qwen Code:**
```
[TEST REPORT - Step 5]
Manual test: IN PROGRESS
Invoice created: ✅ (transaction ID: XXX)
Payment status: paid
Chat session: started
Timer: 25:00
```

---

### Шаг 6: Проверка транзакций в БД

```bash
# Перейдите в директорию сервера
cd /var/www/tarot-miniapp/server

# Проверка транзакций
sqlite3 tarot.db "SELECT id, user_id, tarologist_id, stars_amount, status, created_at FROM transactions ORDER BY created_at DESC LIMIT 10;"

# Проверка сессий чата
sqlite3 tarot.db "SELECT id, user_id, tarologist_id, start_time, active, completed FROM chat_sessions ORDER BY start_time DESC LIMIT 10;"

# Проверка сообщений
sqlite3 tarot.db "SELECT id, session_id, sender_type, message_type, text, timestamp FROM messages ORDER BY timestamp DESC LIMIT 20;"
```

**Отчёт Qwen Code:**
```
[TEST REPORT - Step 6]
Transactions: N records found
Latest: ID=X, Amount=Y stars, Status=completed
Chat sessions: N active
Messages: N total
```

---

### Шаг 7: Проверка работы чата

```bash
# Проверка активных сессий
sqlite3 tarot.db "SELECT cs.id, cs.user_id, cs.tarologist_id, cs.start_time, cs.active, cs.completed FROM chat_sessions cs WHERE cs.active=1 AND cs.completed=0;"

# Логи WebSocket
pm2 logs tarot-server --lines 50 | grep -i "socket\|websocket\|message"
```

**Отчёт Qwen Code:**
```
[TEST REPORT - Step 7]
Active chat sessions: N
WebSocket messages: OK
Chat timer: working
```

---

### Шаг 8: Проверка оценки таролога

После истечения 25 минут:

```bash
# Проверка завершённых сессий
sqlite3 tarot.db "SELECT id, completed, end_time FROM chat_sessions WHERE completed=1 ORDER BY end_time DESC LIMIT 5;"

# Проверка обновлённого рейтинга
sqlite3 tarot.db "SELECT id, name, rating, total_ratings, sessions_completed FROM tarologists;"
```

**Отчёт Qwen Code:**
```
[TEST REPORT - Step 8]
Completed sessions: N
Ratings updated: ✅
Tarologist rating: X.X (N ratings)
```

---

## 🧪 Автоматические тесты (скрипт)

### Создание тестового скрипта

```bash
# Создайте файл
nano /var/www/tarot-miniapp/test-payment.sh
```

**Содержимое:**
```bash
#!/bin/bash

# =============================================================================
# Payment Testing Script for Tarot Mini App
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_DIR="/var/www/tarot-miniapp"
SERVER_DIR="$PROJECT_DIR/server"

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   🧪 Payment Testing Script                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Шаг 1: Проверка PM2
echo -e "${YELLOW}[1/7] Проверка PM2...${NC}"
if pm2 describe tarot-server | grep -q "online"; then
    echo -e "${GREEN}✅ PM2 процесс online${NC}"
else
    echo -e "${RED}❌ PM2 процесс не запущен${NC}"
    exit 1
fi

# Шаг 2: Проверка .env
echo -e "${YELLOW}[2/7] Проверка .env...${NC}"
if [ -f "$SERVER_DIR/.env" ]; then
    if grep -q "TELEGRAM_BOT_TOKEN" "$SERVER_DIR/.env"; then
        echo -e "${GREEN}✅ .env настроен${NC}"
    else
        echo -e "${RED}❌ TELEGRAM_BOT_TOKEN не найден${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ .env файл не найден${NC}"
    exit 1
fi

# Шаг 3: Проверка вебхука
echo -e "${YELLOW}[3/7] Проверка вебхука Telegram...${NC}"
TOKEN=$(grep TELEGRAM_BOT_TOKEN "$SERVER_DIR/.env" | cut -d'=' -f2)
WEBHOOK_INFO=$(curl -s "https://api.telegram.org/bot$TOKEN/getWebhookInfo")

if echo "$WEBHOOK_INFO" | grep -q '"ok":true'; then
    echo -e "${GREEN}✅ Вебхук установлен${NC}"
    echo "$WEBHOOK_INFO" | jq '.result.url'
else
    echo -e "${YELLOW}⚠️ Вебхук не установлен. Настраиваем...${NC}"
    curl -X POST "https://api.telegram.org/bot$TOKEN/setWebhook?url=https://goldtarot.ru/api/payment-webhook"
    echo -e "${GREEN}✅ Вебхук настроен${NC}"
fi

# Шаг 4: Проверка API
echo -e "${YELLOW}[4/7] Проверка API...${NC}"
API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" https://goldtarot.ru/api/tarologists)

if [ "$API_RESPONSE" = "200" ]; then
    echo -e "${GREEN}✅ API отвечает (HTTP $API_RESPONSE)${NC}"
else
    echo -e "${RED}❌ API не отвечает (HTTP $API_RESPONSE)${NC}"
    exit 1
fi

# Шаг 5: Проверка БД
echo -e "${YELLOW}[5/7] Проверка базы данных...${NC}"
if [ -f "$SERVER_DIR/tarot.db" ]; then
    TX_COUNT=$(sqlite3 "$SERVER_DIR/tarot.db" "SELECT COUNT(*) FROM transactions;")
    SESSION_COUNT=$(sqlite3 "$SERVER_DIR/tarot.db" "SELECT COUNT(*) FROM chat_sessions;")
    echo -e "${GREEN}✅ БД существует${NC}"
    echo "   Транзакции: $TX_COUNT"
    echo "   Сессии чата: $SESSION_COUNT"
else
    echo -e "${YELLOW}⚠️ БД будет создана при первой транзакции${NC}"
fi

# Шаг 6: Проверка логов
echo -e "${YELLOW}[6/7] Проверка логов...${NC}"
ERROR_COUNT=$(pm2 logs tarot-server --lines 100 | grep -c "error\|Error\|ERROR" || true)

if [ "$ERROR_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✅ Ошибок в логах нет${NC}"
else
    echo -e "${YELLOW}⚠️ Найдено ошибок: $ERROR_COUNT${NC}"
    pm2 logs tarot-server --lines 50 | grep -i "error"
fi

# Шаг 7: Финальная проверка
echo -e "${YELLOW}[7/7] Финальная проверка...${NC}"
NGINX_STATUS=$(systemctl is-active nginx)

if [ "$NGINX_STATUS" = "active" ]; then
    echo -e "${GREEN}✅ Nginx работает${NC}"
else
    echo -e "${RED}❌ Nginx не работает${NC}"
    exit 1
fi

# Итог
echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}         Тестирование завершено успешно!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}📊 Сводка:${NC}"
echo "   PM2: online"
echo "   .env: настроен"
echo "   Webhook: установлен"
echo "   API: работает"
echo "   Database: $TX_COUNT транзакций, $SESSION_COUNT сессий"
echo "   Errors: $ERROR_COUNT"
echo "   Nginx: active"
echo ""
echo -e "${YELLOW}📍 Сайт: https://goldtarot.ru${NC}"
echo -e "${YELLOW}🤖 Bot: @<your_bot_name>${NC}"
echo ""
```

**Сделайте скрипт исполняемым:**
```bash
chmod +x /var/www/tarot-miniapp/test-payment.sh
```

**Запуск теста:**
```bash
/var/www/tarot-miniapp/test-payment.sh
```

---

## 📊 Формат отчёта для Qwen Code

После каждого шага отправляйте:

```
[TEST REPORT]
Step: <номер>
Status: ✅ PASS / ❌ FAIL / ⚠️ WARNING
Details: <краткое описание>
Logs: <ключевые сообщения>
Next: <следующий шаг или "awaiting instructions">
```

**Пример:**
```
[TEST REPORT]
Step: 3
Status: ✅ PASS
Details: Webhook Telegram установлен
Logs: Webhook URL: https://goldtarot.ru/api/payment-webhook
Next: Step 4 - проверка API
```

---

## 🆘 Аварийные процедуры

### Проблема 1: PM2 процесс упал

```bash
# Перезапуск
pm2 restart tarot-server

# Проверка
pm2 status
```

---

### Проблема 2: Ошибка в логах

```bash
# Просмотр ошибок
pm2 logs tarot-server --err --lines 100

# Перезапуск
pm2 restart tarot-server

# Если не помогло
pm2 stop tarot-server
pm2 delete tarot-server
cd /var/www/tarot-miniapp/server
npm install
pm2 start server.js --name tarot-server
pm2 save
```

---

### Проблема 3: Вебхук не работает

```bash
TOKEN=$(grep TELEGRAM_BOT_TOKEN /var/www/tarot-miniapp/server/.env | cut -d'=' -f2)

# Удалить вебхук
curl -X POST "https://api.telegram.org/bot$TOKEN/deleteWebhook"

# Установить заново
curl -X POST "https://api.telegram.org/bot$TOKEN/setWebhook?url=https://goldtarot.ru/api/payment-webhook"

# Проверить
curl "https://api.telegram.org/bot$TOKEN/getWebhookInfo"
```

---

### Проблема 4: Nginx не раздаёт статику

```bash
# Проверка конфига
nginx -t

# Перезагрузка
systemctl reload nginx

# Проверка
curl -I https://goldtarot.ru
```

---

## ✅ Финальный чек-лист

После завершения тестирования:

```
□ PM2 процесс online
□ .env настроен (токен, webhook)
□ Вебхук Telegram установлен
□ API /api/tarologists отвечает
□ БД существует
□ Транзакции записываются
□ Чат сессии создаются
□ Сообщения сохраняются
□ Таймер работает (25 мин)
□ Оценка таролога обновляется
□ Ошибок в логах нет
□ Nginx работает
```

---

## 📞 Связь с Qwen Code

**Формат сообщений:**

```
[REQUEST] → от Qwen Code
[RESPONSE] → от Opencode Agent
[TEST REPORT] → отчёт о тестировании
[EMERGENCY] → критическая ошибка
```

**Пример запроса:**
```
[REQUEST]
Type: PAYMENT_TEST
Step: 1
Action: Проверка состояния сервера
```

**Пример ответа:**
```
[RESPONSE]
Status: COMPLETED
PM2: online
.env: OK
Webhook: OK
API: OK
Database: OK
Issues: none
```

---

**Готов к тестированию! Ожидаю команду от Qwen Code.** 🧪✨

---

*Версия: 1.0*
*Дата: 2026-03-01*
*Сервер: VDS 89.125.59.117 (goldtarot.ru)*
