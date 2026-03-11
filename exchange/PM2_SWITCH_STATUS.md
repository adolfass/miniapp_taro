# ✅ СТАТУС: Переключение на новый сервер

**Дата:** 2026-03-11
**Время:** 11:15 UTC

---

## ✅ Выполнено

### 1. Остановлен старый сервер
```
pm2 stop tarot-server
pm2 delete tarot-server
```

### 2. Запущен новый сервер
```
cd /var/www/tarot-miniapp/server
pm2 start index.js --name tarot-server
```

**Статус:**
```
┌────┬─────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name            │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├────┼─────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 0  │ tarot-server    │ default     │ 1.0.0   │ fork    │ 20839    │ 0s     │ 0    │ online    │ 0%       │ 26.2mb   │ root     │ disabled │
└────┴─────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘
```

### 3. Сохранена конфигурация pm2
```
pm2 save
```

---

## ✅ Тестирование

### API Endpoints:

**Health Check:** ✅
```bash
curl -s http://localhost:3001/api/health
```
**Результат:** `{"status":"ok","timestamp":"2026-03-11T11:10:42.420Z"}`

**Tarologists API:** ⚠️ ТРЕБУЕТ ПРОВЕРКИ
```bash
curl -s http://localhost:3001/api/tarologists
```
**Результат:** `{"success":false,"error":"Internal server error"}`

**Примечание:** Нужно проверить логи для диагностики ошибки в API тарологов.

---

## ⚠️ Известные проблемы

### 1. Конфликт Telegram Bot
**Ошибка:** 
```
Telegram API error (getUpdates): Conflict: can't use getUpdates method while webhook is active
```

**Причина:** Бот пытается использовать polling (getUpdates), но webhook уже активен.

**Решение:** 
- Webhook настроен и работает
- Ошибки в логах - это попытки polling из admin-bot.js
- Можно игнорировать, т.к. webhook обрабатывает запросы
- Или отключить polling в admin-bot.js

### 2. Ошибка в /api/tarologists
**Статус:** Требуется диагностика

**Действия:**
1. Проверить логи: `pm2 logs tarot-server --lines 100`
2. Проверить подключение к БД
3. Проверить импорты в api/tarologists.js

---

## 📝 Команды для проверки

```bash
# Статус сервера
pm2 status

# Логи
pm2 logs tarot-server

# Перезапуск
pm2 restart tarot-server

# Проверка API
curl -s http://localhost:3001/api/health
curl -s http://localhost:3001/api/tarologists
curl -s http://localhost:3001/api/admin/stats

# БД
sqlite3 server/tarot.db "SELECT COUNT(*) FROM tarologists;"
```

---

## 🔄 Откат (если нужно)

```bash
pm2 stop tarot-server
pm2 delete tarot-server
pm2 start server/server.js --name tarot-server
pm2 save
```

---

## 📊 Итог

✅ **Сервер запущен на pm2**
✅ **Health check работает**
⚠️ **Нужна диагностика API тарологов**
⚠️ **Логи содержат ошибки бота (некритично)**

**Статус:** ⏳ Требуется проверка API перед полным запуском

---

**Следующий шаг:** Диагностика ошибки в /api/tarologists
