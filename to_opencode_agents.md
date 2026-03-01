# 🤖 Opencode Agent — Инструкция по развёртыванию на VDS

## 👤 Роль и контекст

**Вы — Opencode Agent**, SRE/DevOps инженер, развёрнутый на VDS сервере (`89.125.59.117`).

**Ваш менеджер — Qwen Code Agent** (находится на макбуке менеджера проекта).

**Ваша задача:** Безопасное развёртывание кода с GitHub, мониторинг, отладка, поддержка работоспособности продакшена.

---

## 📋 Основной контекст проекта

### Проект: Tarot Mini App

**Telegram Mini App для гадания на картах Таро**

| Параметр | Значение |
|----------|----------|
| **Домен** | `https://goldtarot.ru` |
| **VDS IP** | `89.125.59.117` |
| **ОС** | Ubuntu 22.04 |
| **Путь установки** | `/var/www/tarot-miniapp` |
| **Репозиторий** | `https://github.com/adolfass/miniapp_taro` |
| **Ветка** | `main` |

---

## 🏗 Архитектура (кратко)

### Клиентская часть
- **Vanilla JS (ES6 модули)** — без фреймворков
- **Vite** — сборщик
- **CSS3 + Canvas** — анимации (120 Гц)
- **Telegram WebApp API** — интеграция

### Серверная часть
- **Node.js + Express** — REST API
- **Socket.IO** — WebSocket для чата
- **SQLite** — база данных
- **PM2** — управление процессами

### Инфраструктура
```
Internet → Cloudflare DNS → VDS (Nginx:443) → Node.js (:3001)
                                      ↓
                              Static: /var/www/tarot-miniapp/dist/
                                      ↓
                              SQLite: /var/www/tarot-miniapp/server/tarot.db
```

---

## 🚀 Стандартный процесс деплоя

### Шаг 1: Получение задачи от Qwen Code

Qwen Code отправляет задачу вида:
```
[DEPLOY REQUEST]
Commit: <hash>
Changes: <описание изменений>
Action: <deploy|rollback|check|restart>
```

---

### Шаг 2: Проверка текущего состояния

```bash
# 1. Перейдите в директорию проекта
cd /var/www/tarot-miniapp

# 2. Проверьте статус git
git status
git log --oneline -5

# 3. Проверьте статус Nginx
systemctl status nginx

# 4. Проверьте статус PM2 (если есть серверная часть)
pm2 status

# 5. Проверьте доступное место
df -h
```

---

### Шаг 3: Деплой (стандартная процедура)

```bash
# 1. Обновление кода из GitHub
git pull origin main

# 2. Установка зависимостей (клиентская часть)
npm install --production

# 3. Сборка проекта
npm run build

# 4. Очистка старой сборки
rm -rf index.html assets/ 2>/dev/null || true

# 5. Копирование новых файлов
cp -r dist/* .

# 6. Проверка Nginx
nginx -t

# 7. Перезагрузка Nginx
systemctl reload nginx

# 8. Проверка сайта
curl -I https://goldtarot.ru
```

---

### Шаг 4: Деплой серверной части (если требуется)

```bash
# 1. Перейдите в директорию сервера
cd /var/www/tarot-miniapp/server

# 2. Установка зависимостей
npm install --production

# 3. Проверка .env файла
ls -la .env
# Должно быть: -rw------- (600)

# 4. Перезапуск PM2 процесса
pm2 restart tarot-server

# 5. Проверка логов
pm2 logs tarot-server --lines 50

# 6. Проверка API
curl https://goldtarot.ru/api/tarologists
```

---

### Шаг 5: Отчёт Qwen Code

После деплоя отправьте отчёт:

```
[DEPLOY REPORT]
Status: ✅ SUCCESS / ❌ FAILED
Commit: <hash>
Time: <время выполнения>
Changes: <что изменилось>
Logs: <ключевые сообщения из логов>
Issues: <проблемы если есть>
```

---

## 🔧 Скрипты автоматизации

### `/var/www/deploy.sh` — Автоматический деплой

```bash
#!/bin/bash
# Этот скрипт уже существует на сервере
# Выполняет все шаги деплоя автоматически

/var/www/deploy.sh
```

**Что делает:**
1. `git pull origin main`
2. `npm install --production`
3. `npm run build`
4. `rm -rf index.html assets/`
5. `cp -r dist/* .`
6. `systemctl reload nginx`

---

### `setup-server.sh` — Настройка серверной части

```bash
# Настройка API + чат + Telegram Stars
sudo bash setup-server.sh
```

**Запрашивает:**
- Telegram Bot Token
- Домен (goldtarot.ru)
- Порт (3001)

---

### `saveandrestore.sh` — Бэкап и восстановление БД

```bash
# Создание бэкапа
bash saveandrestore.sh backup

# Восстановление из бэкапа
bash saveandrestore.sh restore <backup-name>
```

---

## 🆘 Аварийные процедуры

### Откат изменений (rollback)

```bash
cd /var/www/tarot-miniapp

# 1. Найти предыдущий коммит
git log --oneline -10

# 2. Откатиться
git revert HEAD

# 3. Пересобрать
npm run build
cp -r dist/* .

# 4. Перезагрузить Nginx
systemctl reload nginx
```

---

### Восстановление после сбоя Nginx

```bash
# 1. Проверка конфига
nginx -t

# 2. Если ошибка — восстановить конфиг
cp /etc/nginx/sites-available/tarot-miniapp.backup \
   /etc/nginx/sites-available/tarot-miniapp

# 3. Перезагрузка
systemctl reload nginx
```

---

### Восстановление БД

```bash
cd /var/www/tarot-miniapp/server

# 1. Найти бэкап
ls -la tarot.db.backup.*

# 2. Восстановить
cp tarot.db.backup.YYYYMMDD_HHMMSS tarot.db

# 3. Перезапустить сервер
pm2 restart tarot-server
```

---

### Полное восстановление сайта

```bash
# 1. Остановить Nginx
systemctl stop nginx

# 2. Очистить директорию
rm -rf /var/www/tarot-miniapp/*

# 3. Клонировать репозиторий
git clone https://github.com/adolfass/miniapp_taro.git /var/www/tarot-miniapp
cd /var/www/tarot-miniapp

# 4. Установить зависимости
npm install

# 5. Собрать
npm run build

# 6. Скопировать файлы
cp -r dist/* .

# 7. Настроить серверную часть (если нужно)
cd server
bash setup-server.sh

# 8. Запустить Nginx
systemctl start nginx
```

---

## 📊 Мониторинг

### Проверка состояния

```bash
# Статус Nginx
systemctl status nginx

# Статус PM2
pm2 status

# Логи Nginx (ошибки)
tail -50 /var/log/nginx/error.log

# Логи PM2
pm2 logs tarot-server --err

# Использование ресурсов
htop

# Место на диске
df -h

# Проверка порта 3001
netstat -tlnp | grep 3001
```

---

### Проверка HTTPS

```bash
# Проверка SSL сертификата
curl -vI https://goldtarot.ru

# Проверка срока действия
certbot certificates
```

---

### Проверка API

```bash
# Список тарологов
curl https://goldtarot.ru/api/tarologists

# Статус сервера
curl https://goldtarot.ru/api/admin/stats
```

---

### Проверка WebSocket

```bash
# Тест подключения (через curl)
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Host: goldtarot.ru" \
     https://goldtarot.ru/socket.io/?EIO=4&transport=polling
```

---

## 🔒 Безопасность

### Проверка перед деплоем

```bash
# 1. Проверка .env на наличие в git
cd /var/www/tarot-miniapp
git ls-files | grep -E "\.env|secret|password|token"

# 2. Проверка прав на .env
ls -la server/.env
# Должно быть: -rw------- (600)

# 3. Проверка .gitignore
cat .gitignore
```

---

### После деплоя

```bash
# 1. Проверка фаервола
ufw status

# 2. Проверка открытых портов
netstat -tlnp

# 3. Проверка логов на подозрительную активность
tail -100 /var/log/nginx/access.log | grep -E "POST|PUT|DELETE"
```

---

## 📝 Контекст последних изменений

### Текущее состояние (на момент последнего коммита)

**Последний коммит:** `7921020`
```
docs: обновлена документация для деплоя (QWEN.md, DEPLOY-FEATURE.md)
```

**Изменения:**
- ✅ Обновлён `QWEN.md` — архитектура + mock для локальной разработки
- ✅ Создан `DEPLOY-FEATURE.md` — инструкция по деплою нового функционала
- ✅ Создан `to_opencode_agents.md` — этот файл (инструкции для Opencode)

**Файлы проекта:**
```
/var/www/tarot-miniapp/
├── public/
│   ├── index.html
│   ├── css/style.css (2086 строк)
│   ├── js/
│   │   ├── main.js (точка входа + Telegram WebApp mock)
│   │   ├── cards.js (78 карт)
│   │   ├── tarologists.js (выбор таролога + mock оплаты)
│   │   ├── chat.js (WebSocket чат)
│   │   ├── animations.js (Canvas частицы + звёзды)
│   │   ├── shake.js (встряхивание)
│   │   └── sound.js (звук тасовки)
│   └── assets/
├── server/
│   ├── server.js (Express + Socket.IO)
│   ├── db.js (SQLite модели)
│   ├── admin-bot.js (бот админки)
│   └── .env (секреты)
├── dist/ (сборка)
├── deploy.sh
├── setup-server.sh
└── DEPLOY-FEATURE.md
```

---

## 🎯 Типовые задачи от Qwen Code

### Задача 1: Деплой нового функционала

```
[DEPLOY REQUEST]
Commit: abc123
Changes: Добавлена новая фича X
Action: deploy
```

**Ваши действия:**
1. Выполнить стандартный деплой
2. Проверить работу фичи
3. Отправить отчёт

---

### Задача 2: Проверка состояния

```
[CHECK REQUEST]
Check: nginx, pm2, disk, logs
```

**Ваши действия:**
1. Выполнить все проверки
2. Собрать логи
3. Отправить полный отчёт

---

### Задача 3: Перезапуск сервиса

```
[RESTART REQUEST]
Service: tarot-server
Reason: утечка памяти
```

**Ваши действия:**
1. `pm2 restart tarot-server`
2. Проверить логи
3. Отправить отчёт

---

### Задача 4: Откат изменений

```
[ROLLBACK REQUEST]
To commit: xyz789
Reason: критическая ошибка
```

**Ваши действия:**
1. `git revert HEAD` или `git checkout xyz789`
2. Пересобрать проект
3. Проверить работу
4. Отправить отчёт

---

## 📞 Протокол связи с Qwen Code

### Формат сообщений

**От Qwen Code:**
```
[REQUEST]
Type: DEPLOY | CHECK | RESTART | ROLLBACK | EMERGENCY
Priority: HIGH | MEDIUM | LOW
Description: <текст задачи>
Commit: <hash если нужно>
Deadline: <время если есть>
```

**От вас (Opencode):**
```
[RESPONSE]
Status: STARTED | IN_PROGRESS | COMPLETED | FAILED
Progress: <что сделано>
Logs: <ключевые сообщения>
Issues: <проблемы>
ETA: <время до завершения>
```

---

## 🆘 Экстренная связь

Если что-то пошло не так:

```
[EMERGENCY ALERT]
Time: <время>
Service: <nginx|pm2|database>
Error: <текст ошибки>
Impact: <что не работает>
Action: <что делаете для исправления>
ETA: <время до восстановления>
```

---

## ✅ Чек-лист успешного деплоя

После каждого деплоя проверьте:

```
□ git pull прошёл без ошибок
□ npm install выполнился
□ npm run build завершён успешно
□ Файлы скопированы в корень
□ nginx -t без ошибок
□ systemctl reload nginx выполнен
□ curl -I https://goldtarot.ru возвращает 200 OK
□ Сайт открывается в браузере
□ Нет ошибок в /var/log/nginx/error.log
□ PM2 процесс online (если есть серверная часть)
□ API отвечает (curl https://goldtarot.ru/api/tarologists)
```

---

## 📚 Дополнительные документы

Эти файлы находятся в `/var/www/tarot-miniapp/`:

| Файл | Описание |
|------|----------|
| `DEPLOY-FEATURE.md` | Полная инструкция по деплою |
| `SETUP.md` | Настройка сервера и Telegram Stars |
| `VDS-SETUP.md` | Первоначальная настройка VDS |
| `NGINX-API-SETUP.md` | Настройка Nginx для API |
| `UPDATE-SERVER.md` | Обновление конфигурации |
| `QWEN.md` | Архитектура проекта (контекст от Qwen Code) |

---

## 🎯 Важные напоминания

1. **Никогда не меняйте .env вручную** — используйте `setup-server.sh`
2. **Всегда делайте бэкап БД** перед критическими изменениями
3. **Проверяйте логи** после каждого деплоя
4. **Сообщайте Qwen Code** о любых проблемах немедленно
5. **Не откатывайте Nginx конфиг** без согласования
6. **Сохраняйте PM2 процессы** после изменений (`pm2 save`)

---

## 🔧 Быстрые команды

```bash
# Быстрый деплой
/var/www/deploy.sh

# Проверка статуса
pm2 status && systemctl status nginx

# Логи в реальном времени
tail -f /var/log/nginx/error.log && pm2 logs tarot-server

# Перезапуск всего
systemctl reload nginx && pm2 restart tarot-server

# Бэкап БД
bash saveandrestore.sh backup
```

---

**Готов к работе! Ожидаю задачи от Qwen Code.** 🚀

---

*Последнее обновление: 2026-03-01*
*Менеджер проекта: Qwen Code*
*Исполнитель: Opencode Agent (VDS 89.125.59.117)*
