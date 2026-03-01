# 🚀 Развёртывание нового функционала на сервере

## 📋 Обзор процесса

Этот документ описывает полный цикл деплоя новых функций на продакшен сервер.

---

## 🔄 Варианты деплоя

### Вариант 1: Автоматический (через deploy.sh) ⭐ Рекомендуется

```bash
# На сервере (SSH)
ssh root@89.125.59.117

# Выполнить скрипт деплоя
/var/www/deploy.sh
```

**Что делает скрипт:**
1. ✅ `git pull origin main` — обновление кода
2. ✅ `npm install --production` — установка зависимостей
3. ✅ `npm run build` — сборка проекта
4. ✅ `rm -rf index.html assets/` — очистка старой сборки
5. ✅ `cp -r dist/* .` — копирование новых файлов
6. ✅ `systemctl reload nginx` — перезагрузка Nginx

---

### Вариант 2: Ручной (пошаговый)

```bash
# 1. Подключение к серверу
ssh root@89.125.59.117

# 2. Переход в директорию проекта
cd /var/www/tarot-miniapp

# 3. Обновление кода
git pull origin main

# 4. Установка зависимостей
npm install --production

# 5. Сборка проекта
npm run build

# 6. Копирование файлов из dist/
cp -r dist/* .

# 7. Проверка Nginx
nginx -t

# 8. Перезагрузка Nginx
systemctl reload nginx
```

---

### Вариант 3: GitHub Actions (автоматически при push)

При пуше в ветку `main`:
1. ✅ GitHub Actions автоматически соберёт проект
2. ✅ Задеплоит на **GitHub Pages** (тестовый стенд)
3. ✅ Вы получите URL для проверки

**URL после деплоя:**
```
https://adolfass.github.io/miniapp/
```

⚠️ **Важно:** GitHub Pages деплоит только клиентскую часть (без сервера API).

---

## 🎯 Деплой нового функционала: пошагово

### Шаг 1: Подготовка кода (локально)

```bash
# 1. Проверка изменений
git status

# 2. Просмотр изменений
git diff HEAD

# 3. Добавление файлов
git add .

# 4. Коммит
git commit -m "feat: описание нового функционала"

# 5. Пуш в репозиторий
git push origin main
```

---

### Шаг 2: Деплой на сервер

```bash
# Подключение к серверу
ssh root@89.125.59.117

# Запуск скрипта деплоя
/var/www/deploy.sh
```

**Лог успешного деплоя:**
```
╔════════════════════════════════════════════════════════╗
║   🚀 Деплой Tarot Mini App                            ║
╚════════════════════════════════════════════════════════╝

[1/6] Обновление кода из GitHub...
✅ Код обновлён

[2/6] Установка зависимостей...
✅ Зависимости установлены

[3/6] Сборка проекта...
✅ Проект собран

[4/6] Очистка старой сборки...
✅ Очистка завершена

[5/6] Копирование файлов из dist...
✅ Файлы скопированы

[6/6] Проверка и перезагрузка Nginx...
✅ Nginx перезапущен

╔════════════════════════════════════════════════════════╗
║   ✅ Деплой завершён успешно!                         ║
╚════════════════════════════════════════════════════════╝

📍 Сайт доступен: https://goldtarot.ru

Последний коммит:
bfe1966 Добавить скрипт бэкапа и восстановления
```

---

### Шаг 3: Проверка на сервере

```bash
# 1. Проверка статуса Nginx
systemctl status nginx

# 2. Проверка логов
tail -f /var/log/nginx/access.log

# 3. Проверка HTTPS
curl -I https://goldtarot.ru

# 4. Проверка API (если деплоили серверную часть)
curl https://goldtarot.ru/api/tarologists
```

---

### Шаг 4: Тестирование на телефоне

1. Откройте Telegram на телефоне
2. Перейдите на `https://goldtarot.ru`
3. Проверьте новый функционал

**Чек-лист проверки:**
```
□ Сайт загружается
□ Нет ошибок в консоли
□ Новый функционал работает
□ Старый функционал не сломался
□ Мобильная версия корректна
```

---

## 🔧 Деплой серверной части (API + чат)

Если новый функционал требует серверную часть:

### Шаг 1: Настройка сервера (если ещё не настроен)

```bash
# На сервере
cd /var/www/tarot-miniapp

# Запуск скрипта настройки
sudo bash setup-server.sh
```

**Скрипт запросит:**
- Telegram Bot Token (получить у @BotFather)
- Домен (по умолчанию: goldtarot.ru)
- Порт (по умолчанию: 3001)

---

### Шаг 2: Проверка PM2 процесса

```bash
# Статус процессов
pm2 status

# Должно быть:
# ┌────┬───────────┬─────────────┬─────────┬─────────┬──────────┬────────────┬──────┬────────────┐
# │ id │ name      │ namespace   │ version │ mode    │ pid      │ uptime     │ ↺    │ status     │
# ├────┼───────────┼─────────────┼─────────┼─────────┼──────────┼────────────┼──────┼────────────┤
# │ 0  │ tarot-serv│ default     │ 1.0.0   │ fork    │ 1234     │ 10d        │ 0    │ online     │
# └────┴───────────┴─────────────┴─────────┴─────────┴──────────┴────────────┴──────┴────────────┘
```

---

### Шаг 3: Перезапуск сервера

```bash
# Перезапуск процесса
pm2 restart tarot-server

# Просмотр логов
pm2 logs tarot-server
```

---

### Шаг 4: Проверка API

```bash
# Проверка эндпоинта
curl https://goldtarot.ru/api/tarologists

# Проверка WebSocket
# Откройте консоль браузера и выполните:
# const socket = io('https://goldtarot.ru');
# socket.on('connect', () => console.log('Connected!'));
```

---

## 🆘 Откат изменений

Если что-то пошло не так:

### Вариант 1: Откат через git

```bash
# На сервере
cd /var/www/tarot-miniapp

# Просмотр истории
git log --oneline -10

# Откат к предыдущему коммиту
git revert HEAD

# Или к конкретному коммиту
git checkout <commit-hash>

# Пересборка
npm run build
cp -r dist/* .

# Перезагрузка Nginx
systemctl reload nginx
```

---

### Вариант 2: Бэкап файлов

```bash
# На сервере
cd /var/www/tarot-miniapp

# Восстановление из бэкапа
/var/www/restore.sh <backup-name>
```

---

### Вариант 3: Бэкап базы данных

```bash
# На сервере
cd /var/www/tarot-miniapp/server

# Бэкап БД
cp tarot.db tarot.db.backup.$(date +%Y%m%d_%H%M%S)

# Восстановление
cp tarot.db.backup.YYYYMMDD_HHMMSS tarot.db
```

---

## 📊 Мониторинг после деплоя

### Логи Nginx

```bash
# Логи в реальном времени
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Последние 100 строк error лога
tail -100 /var/log/nginx/error.log
```

---

### Логи PM2

```bash
# Логи сервера
pm2 logs tarot-server

# Только ошибки
pm2 logs tarot-server --err
```

---

### Статистика PM2

```bash
# Статус процессов
pm2 status

# Детальная информация
pm2 show tarot-server

# Использование памяти
pm2 monit
```

---

## 🔒 Безопасность при деплое

### Проверка перед деплоем

```bash
# 1. Проверка .env файлов (не должны содержать реальные ключи)
grep -r "TELEGRAM_BOT_TOKEN" public/

# 2. Проверка коммитов на наличие секретов
git log --all --full-history --source -- '*secret*' '*password*' '*token*'

# 3. Проверка .gitignore
cat .gitignore
```

---

### После деплоя

```bash
# 1. Проверка прав на .env
ls -la /var/www/tarot-miniapp/server/.env
# Должно быть: -rw------- (600)

# 2. Проверка фаервола
ufw status

# 3. Проверка SSL сертификата
certbot certificates
```

---

## ✅ Финальный чек-лист

После деплоя проверьте:

```
□ Сайт открывается по HTTPS
□ Замочек в адресной строке
□ Все карты загружаются
□ Анимации работают (120 Гц)
□ Звук тасовки (если есть файл)
□ Telegram WebApp инициализируется
□ Вибрация срабатывает
□ Встряхивание работает
□ Выбор таролога отображается
□ Оплата (mock) работает
□ Чат подключается (WebSocket)
□ Мобильная версия корректна
□ Ошибок в консоли нет
□ Логи Nginx чистые
□ PM2 процесс online
```

---

## 📞 Экстренная помощь

Если сайт не работает после деплоя:

```bash
# 1. Проверка Nginx
systemctl status nginx
nginx -t

# 2. Проверка PM2
pm2 status
pm2 logs tarot-server --err

# 3. Проверка логов
tail -50 /var/log/nginx/error.log

# 4. Откат изменений
cd /var/www/tarot-miniapp
git log --oneline -5
git revert HEAD
npm run build
cp -r dist/* .
systemctl reload nginx
```

---

## 🎯 Автоматизация (опционально)

### Настройка авто-деплоя при пуше

```bash
# На сервере создайте webhook
cd /var/www/tarot-miniapp

# Создайте скрипт webhook
nano webhook.php
```

```php
<?php
exec('cd /var/www/tarot-miniapp && git pull origin main && npm run build && cp -r dist/* . && systemctl reload nginx');
?>
```

**Настройте GitHub webhook:**
1. GitHub → Settings → Webhooks
2. Add webhook
3. Payload URL: `https://goldtarot.ru/webhook.php`
4. Content type: `application/json`
5. Secret: ваш секрет

⚠️ **Внимание:** Это упрощённая схема. Для продакшена используйте GitHub Actions или CI/CD.

---

## 📚 Дополнительные документы

- `DEPLOY.md` — базовая инструкция по деплою
- `SETUP.md` — полная настройка сервера
- `VDS-SETUP.md` — первоначальная настройка VDS
- `NGINX-API-SETUP.md` — настройка Nginx для API
- `UPDATE-SERVER.md` — обновление конфигурации

---

**Готово! Теперь вы можете развёртывать новый функционал на сервере!** 🎴✨
