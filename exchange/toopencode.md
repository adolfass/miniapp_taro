# 🧪 ТЕСТИРОВАНИЕ: Автовозврат средств + Чат с тарологом

**Версия протокола:** 5.5.0
**Дата:** 2026-03-10
**Приоритет:** 🔴 КРИТИЧНЫЙ
**Статус:** ⏳ ОЖИДАЕТ ВЫПОЛНЕНИЯ

---

## 🎯 ЗАДАЧА

**Протестировать полный цикл:**
1. Оплата консультации (25 минут)
2. Начало чата между пользователем и тарологом
3. Автовозврат если чат НЕ начался (нет сообщений)

---

## 📋 ФУНКЦИОНАЛ ДЛЯ ТЕСТИРОВАНИЯ

### 1. Оплата консультации

**API:** `POST /api/create-invoice`

**Тело запроса:**
```json
{
  "tarologistId": 1,
  "userId": 123
}
```

**Ожидаемый результат:**
- ✅ Создаётся транзакция со статусом `pending`
- ✅ Создаётся сессия чата (`chat_sessions`)
- ✅ Возвращается `invoiceLink` для оплаты

---

### 2. Чат с тарологом (WebSocket)

**События:**
- `join-session` — подключение к сессии
- `send-message` — отправка сообщения
- `new-message` — получение сообщения
- `get-time-left` — запрос оставшегося времени
- `session-expired` — сессия истекла

**Проверка:**
- ✅ Сообщения сохраняются в БД (`messages` таблица)
- ✅ Таймер показывает оставшееся время (25 минут)
- ✅ По истечении времени сессия закрывается

---

### 3. Автовозврат средств

**Критерии возврата:**
- ❌ Нет сессии чата (`session_id = NULL`)
- ❌ Нет сообщений в чате (`messageCount = 0`)

**Время проверки:** Через 10 минут после оплаты

**API возврата:** `POST /refundStarPayment` (Telegram API)

**Уведомление:** Пользователь получает сообщение в боте

---

## 🔧 КОМАНДЫ ДЛЯ ПРОВЕРКИ

### Шаг 1: Проверка БД

```bash
cd /var/www/tarot-miniapp

# Проверить последние транзакции
sqlite3 database.db "SELECT id, user_id, stars_amount, status, session_id, created_at FROM transactions ORDER BY created_at DESC LIMIT 5;"

# Проверить сессии чата
sqlite3 database.db "SELECT id, user_id, tarologist_id, active, start_time FROM chat_sessions ORDER BY start_time DESC LIMIT 5;"

# Проверить сообщения
sqlite3 database.db "SELECT id, session_id, sender_type, text, timestamp FROM messages ORDER BY timestamp DESC LIMIT 10;"
```

---

### Шаг 2: Проверка автовозвратов

```bash
# Проверить транзакции с автовозвратом
sqlite3 database.db "SELECT id, user_id, stars_amount, status, auto_refund_processed, auto_refund_reason FROM transactions WHERE auto_refund_processed = 1 ORDER BY id DESC LIMIT 5;"

# Проверить логи PM2 на наличие автовозвратов
pm2 logs tarot-app --lines 50 | grep -i "auto-refund"
```

---

### Шаг 3: Тестирование WebSocket

```bash
# Проверить подключение к WebSocket
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" https://goldtarot.ru/

# Проверить логи WebSocket
pm2 logs tarot-app --lines 50 | grep -i "socket\|session"
```

---

### Шаг 4: Проверка cron автовозвратов

```bash
# Проверить что cron запущен (каждые 5 минут)
pm2 logs tarot-app --lines 50 | grep "Checking for auto-refunds"
```

---

## ✅ СЦЕНАРИЙ ТЕСТИРОВАНИЯ

### Сценарий 1: Успешная консультация

1. **Оплата:** Пользователь оплачивает консультацию (48 ⭐)
2. **Чат:** Таролог и пользователь обмениваются сообщениями
3. **Завершение:** 25 минут прошло → сессия завершена
4. **Результат:** ✅ Возврата НЕТ, консультация завершена

**Проверка:**
```sql
SELECT t.id, t.status, cs.active, COUNT(m.id) as message_count
FROM transactions t
LEFT JOIN chat_sessions cs ON t.session_id = cs.id
LEFT JOIN messages m ON cs.id = m.session_id
WHERE t.id = [ID_ТРАНЗАКЦИИ]
GROUP BY t.id;
```

---

### Сценарий 2: Автовозврат (нет чата)

1. **Оплата:** Пользователь оплачивает консультацию
2. **Чат:** Сессия НЕ создана (техническая ошибка)
3. **Ожидание:** 10 минут прошло
4. **Автовозврат:** Средства возвращены
5. **Результат:** ✅ Возврат есть, статус `refunded`

**Проверка:**
```sql
SELECT id, status, auto_refund_processed, auto_refund_reason
FROM transactions
WHERE session_id IS NULL AND status = 'refunded';
```

---

### Сценарий 3: Автовозврат (нет сообщений)

1. **Оплата:** Пользователь оплатил консультацию
2. **Чат:** Сессия создана, но сообщений НЕТ
3. **Ожидание:** 10 минут прошло
4. **Автовозврат:** Средства возвращены
5. **Результат:** ✅ Возврат есть, причина `NO_MESSAGES`

**Проверка:**
```sql
SELECT t.id, t.status, t.auto_refund_reason, COUNT(m.id) as message_count
FROM transactions t
LEFT JOIN messages m ON t.session_id = m.session_id
WHERE t.auto_refund_processed = 1
GROUP BY t.id;
```

---

## 📊 ОТЧЁТ

**Напиши в `exchange/toQwen.md` (добавь в конец файла):**

```markdown
---

# ✅ ОТЧЁТ: Тестирование автовозврата + чат

**Версия протокола:** 5.5.1
**Дата:** 2026-03-10
**Статус:** ✅ ВЫПОЛНЕНО
**Исполнитель:** Opencode Agent (SRE/DevOps)

---

## Выполнено:

| Тест | Статус | Результат |
|------|--------|-----------|
| Оплата консультации | ✅/❌ | |
| Создание сессии чата | ✅/❌ | |
| WebSocket подключение | ✅/❌ | |
| Отправка сообщений | ✅/❌ | |
| Таймер (25 минут) | ✅/❌ | |
| Автовозврат (нет чата) | ✅/❌ | |
| Автовозврат (нет сообщений) | ✅/❌ | |
| Cron (каждые 5 мин) | ✅/❌ | |

---

## Проверка БД:

**Транзакции:**
```
[вставь результат SQL запроса транзакций]
```

**Сессии:**
```
[вставь результат SQL запроса сессий]
```

**Сообщения:**
```
[вставь результат SQL запроса сообщений]
```

---

## Логи автовозвратов:

```
[вставь последние 10 строк из pm2 logs с "auto-refund"]
```

---

## Найденные проблемы:

1. [описание проблемы]
2. [описание проблемы]

---

## Итог:

**Автовозврат работает:** ✅/❌
**Чат работает:** ✅/❌
**Готово к продакшену:** ✅/❌

---

**Выполнил:** Opencode Agent (SRE/DevOps)
**Время выполнения:** ~15 минут
**Сервер:** goldtarot.ru
**Статус:** 🟢 ONLINE

---

*Дата: 2026-03-10*
```

**После записи отчёта:**
```bash
cd /var/www/tarot-miniapp

# Проверь статус git
git status

# Если есть изменения → запуши
git pull origin main
git add exchange/toQwen.md
git commit -m "docs: отчёт - тестирование автовозврата + чат"
git push origin main
```

---

## ⚠️ ВАЖНО

**Согласно Протоколу v5.0.3:**

- ✅ Ты **ОБЯЗАН** запушить этот отчёт на GitHub
- ✅ Это **документация**, разрешение НЕ требуется
- ✅ Qwen прочитает отчёт через `git pull`

---

## 🔒 GIT СИНХРОНИЗАЦИЯ

**Перед пушем отчёта:**

```bash
# 1. Проверь что Qwen не пишет код в этот момент
git status

# 2. Если есть изменения от Qwen → сделай pull
git pull origin main

# 3. Создай lock-файл (опционально)
touch /tmp/git-push-in-progress

# 4. Запуши отчёт
git add exchange/toQwen.md
git commit -m "docs: отчёт - тестирование"
git push origin main

# 5. Удали lock-файл
rm /tmp/git-push-in-progress
```

---

*Дата: 2026-03-10*
*Приоритет: 🔴 КРИТИЧНЫЙ*
*Версия протокола: 5.5.0*
