# Tarot Mini App — Инструкция по настройке и запуску

## 📋 Обзор

Этот проект состоит из двух частей:
1. **Клиентская часть** (Vanilla JS + Vite) — Telegram Mini App
2. **Серверная часть** (Node.js + Express) — API для оплаты и чата

---

## 🚀 Быстрый старт (локальная разработка)

### 1. Клиентская часть

```bash
# Установка зависимостей
npm install

# Запуск dev-сервера (порт 3000)
npm run dev
```

### 2. Серверная часть

```bash
# Перейдите в директорию сервера
cd server

# Установка зависимостей
npm install

# Копирование .env.example в .env
cp .env.example .env

# Редактирование .env (добавьте токен бота)
nano .env

# Запуск сервера (порт 3001)
npm run dev
```

---

## ⚙️ Настройка сервера

### 1. Получение Telegram Bot Token

1. Откройте [@BotFather](https://t.me/BotFather)
2. Создайте нового бота: `/newbot`
3. Скопируйте токен

### 2. Настройка переменных окружения

Откройте `server/.env` и заполните:

```bash
# Telegram Bot Token (получить у @BotFather)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz

# Telegram Stars provider token (всегда "STARS")
TELEGRAM_PROVIDER_TOKEN=STARS

# URL для вебхуков Telegram (ваш домен)
TELEGRAM_WEBHOOK_URL=https://your-domain.com/api/payment-webhook

# Порт сервера
PORT=3001

# Секретный ключ для сессий (любая случайная строка)
SESSION_SECRET=your_secret_key_here_random_string_12345

# URL клиента (для CORS)
CLIENT_URL=https://your-domain.com
```

### 3. Настройка вебхука Telegram

После запуска сервера вебхук установится автоматически.

Для ручной установки:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-domain.com/api/payment-webhook"
```

Проверка:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

---

## 📦 Сборка для продакшена

### Клиентская часть

```bash
npm run build
# Файлы в dist/
```

### Серверная часть

```bash
cd server
npm install --production
```

---

## 🌐 Деплой на VDS

### 1. Подготовка сервера

```bash
# Установка Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установка Nginx
sudo apt install nginx -y

# Установка PM2 для управления процессом
sudo npm install -g pm2
```

### 2. Загрузка файлов

```bash
# Создайте директорию
sudo mkdir -p /var/www/tarot-miniapp

# Загрузите файлы (через SCP или Git)
cd /var/www/tarot-miniapp
git clone <your-repo-url> .
```

### 3. Настройка сервера

```bash
# Перейдите в директорию сервера
cd /var/www/tarot-miniapp/server

# Установите зависимости
npm install --production

# Скопируйте и настройте .env
cp .env.example .env
nano .env
```

### 4. Запуск через PM2

```bash
# Запуск сервера
cd /var/www/tarot-miniapp/server
pm2 start server.js --name tarot-server

# Сохранение конфигурации PM2
pm2 save

# Автозапуск при загрузке
pm2 startup
```

### 5. Настройка Nginx

```bash
sudo nano /etc/nginx/sites-available/tarot-miniapp
```

Конфигурация:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Клиентская часть (статика)
    location / {
        root /var/www/tarot-miniapp/dist;
        try_files $uri $uri/ /index.html;
    }

    # API сервер
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket для чата
    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Активация:

```bash
sudo ln -s /etc/nginx/sites-available/tarot-miniapp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. HTTPS (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

---

## 🗄 Структура базы данных

Сервер автоматически создаёт SQLite базу данных `server/tarot.db` со следующими таблицами:

### tarologists
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER | ID таролога |
| name | TEXT | Имя |
| photo_url | TEXT | URL фото |
| description | TEXT | Описание |
| rating | REAL | Средний рейтинг |
| total_ratings | INTEGER | Количество оценок |
| sessions_completed | INTEGER | Завершённые сессии |
| telegram_id | TEXT | Telegram ID |

### users
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER | ID пользователя |
| telegram_id | TEXT | Telegram ID (уникальный) |
| username | TEXT | Username |
| first_name | TEXT | Имя |
| last_name | TEXT | Фамилия |

### transactions
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER | ID транзакции |
| user_id | INTEGER | ID пользователя |
| tarologist_id | INTEGER | ID таролога |
| amount | INTEGER | Сумма в звёздах |
| stars_amount | INTEGER | Количество звёзд |
| developer_cut | INTEGER | Комиссия разработчика (10%) |
| tarologist_cut | INTEGER | Выплата тарологу (90%) |
| status | TEXT | pending/completed/failed |
| telegram_payment_id | TEXT | ID платежа Telegram |

### chat_sessions
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER | ID сессии |
| user_id | INTEGER | ID пользователя |
| tarologist_id | INTEGER | ID таролога |
| start_time | DATETIME | Время начала |
| end_time | DATETIME | Время окончания |
| duration_seconds | INTEGER | Длительность (1500 = 25 мин) |
| active | BOOLEAN | Активна ли сессия |
| completed | BOOLEAN | Завершена ли сессия |

### messages
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER | ID сообщения |
| session_id | INTEGER | ID сессии |
| sender_id | INTEGER | ID отправителя |
| sender_type | TEXT | client/tarologist |
| text | TEXT | Текст сообщения |
| timestamp | DATETIME | Время отправки |

---

## 🧪 Тестирование

### Локальное тестирование

1. Запустите клиент: `npm run dev`
2. Запустите сервер: `cd server && npm run dev`
3. Откройте `http://localhost:3000`

В режиме разработки используются:
- Mock данные тарологов
- Mock оплата (автоматически "успешна" через 2 сек)
- Mock Telegram WebApp API

### Тестирование в Telegram

1. Соберите клиент: `npm run build`
2. Задеплойте на сервер
3. В @BotFather настройте Web App URL
4. Откройте бота на мобильном устройстве

---

## 💰 Логика ценообразования

Цена рассчитывается по формуле:

```javascript
level = floor(sessions_completed / 10) + 1
price = min(33 * (1.1 ^ (level - 1)), 333)
```

**Примеры:**
- 0 сессий → уровень 1 → **33 ⭐**
- 10 сессий → уровень 2 → **36 ⭐**
- 50 сессий → уровень 6 → **53 ⭐**
- 250 сессий → уровень 26 → **333 ⭐** (максимум)

---

## 🔧 API Endpoints

### GET /api/tarologists
Получить список всех тарологов

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Александра",
      "photo_url": "...",
      "description": "...",
      "rating": 4.8,
      "total_ratings": 127,
      "sessions_completed": 45,
      "level": 5,
      "price": 48
    }
  ]
}
```

### POST /api/create-invoice
Создать инвойс для оплаты

**Тело запроса:**
```json
{
  "tarologistId": 1,
  "initData": "query_id=...&user=...&hash=..."
}
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "transactionId": 123,
    "invoiceLink": "https://t.me/invoice/...",
    "starsAmount": 48
  }
}
```

### POST /api/payment-webhook
Вебхук от Telegram о статусе платежа

### POST /api/rate
Оценить таролога

**Тело запроса:**
```json
{
  "tarologistId": 1,
  "userId": 123,
  "rating": 5,
  "sessionId": 456
}
```

### GET /api/session/:id/messages
Получить сообщения сессии

---

## 📱 Поток пользователя

1. **Расклад** → Пользователь делает расклад (ежедневный или на ситуацию)
2. **Выбор таролога** → Нажимает "Поделиться с тарологом"
3. **Оплата** → Выбирает таролога → Подтверждает оплату → Telegram Stars
4. **Чат** → 25-минутная консультация с таймером
5. **Оценка** → Оценивает таролога (1-5 звёзд)
6. **Завершение** → Возврат к раскладам

---

## ⚠️ Важные замечания

### Распределение платежа

Telegram Stars **не поддерживает** автоматическое расщепление платежа.

**Текущая схема:**
1. Все звёзды поступают на счёт владельца бота
2. Сервер фиксирует транзакцию с разделением (10%/90%)
3. Выплата тарологам производится вручную или через отдельный механизм

**Для MVP:** Реализовано только учётом в БД. Выплаты требуют ручной обработки.

### Безопасность

- Все запросы к API проверяют подпись Telegram (`initData`)
- WebSocket подключается только после авторизации
- CORS настроен на конкретный домен

### Лимиты

- Максимальная цена: 333 ⭐
- Длительность чата: 25 минут (1500 секунд)
- Максимальная длина сообщения: 500 символов

---

## 🐛 Устранение проблем

### Сервер не запускается

```bash
# Проверьте логи
cd server
node server.js

# Проверьте .env
cat .env
```

### Вебхук не работает

```bash
# Проверьте статус
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Перенастройте
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain.com/api/payment-webhook"
```

### WebSocket не подключается

1. Проверьте, что порт 3001 открыт
2. Проверьте Nginx конфигурацию для `/socket.io`
3. Включите `proxy_set_header Upgrade $http_upgrade`

---

## 📞 Поддержка

Вопросы и предложения: создайте issue в репозитории GitHub.
