# 🔑 Настройка доступа админа к Telegram боту

## 📋 Обзор

Для доступа к админ-панели через Telegram бота `@goldentarot_bot` необходимо:

1. Узнать ваш Telegram ID
2. Добавить его в `.env` файл сервера
3. Перезапустить сервер
4. Проверить доступ к админке

---

## 🎯 Шаг 1: Получить Telegram ID

### Способ 1: Через @userinfobot (рекомендуется)

1. Откройте Telegram
2. Найдите бота: **@userinfobot**
3. Нажмите `/start`
4. Бот вернёт ваш ID (число, например: `123456789`)

### Способ 2: Через @RawDataBot

1. Откройте Telegram
2. Найдите бота: **@RawDataBot**
3. Нажмите `/start`
4. В ответе найдите поле `"id"` в объекте `"from"`

### Способ 3: Через веб-интерфейс

Откройте в браузере:
```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe
```

Это вернёт информацию о боте. Для получения вашего ID используйте @userinfobot.

---

## 🎯 Шаг 2: Добавить ADMIN_TELEGRAM_ID в .env

### На сервере (VDS):

```bash
# Подключение к серверу
ssh root@89.125.59.117

# Переход в директорию сервера
cd /var/www/tarot-miniapp/server

# Редактирование .env
nano .env
```

### Добавьте строку:

```bash
# Telegram Bot Token
TELEGRAM_BOT_TOKEN=<YOUR_BOT_TOKEN>

# Telegram Stars provider
TELEGRAM_PROVIDER_TOKEN=STARS

# Webhook URL
TELEGRAM_WEBHOOK_URL=https://goldtarot.ru/api/payment-webhook

# Порт сервера
PORT=3001

# Session Secret
SESSION_SECRET=<существующий ключ>

# Client URL
CLIENT_URL=https://goldtarot.ru

# ⭐ ADMIN TELEGRAM ID (добавьте эту строку)
ADMIN_TELEGRAM_ID=123456789
```

**Замените `123456789` на ваш реальный Telegram ID!**

### Сохранение:
- `Ctrl+O` → `Enter` (сохранить)
- `Ctrl+X` (выйти)

---

## 🎯 Шаг 3: Перезапуск сервера

```bash
# Перезапуск PM2 процесса
pm2 restart tarot-server

# Проверка статуса
pm2 status

# Проверка логов
pm2 logs tarot-server --lines 20
```

---

## 🎯 Шаг 4: Проверка доступа к админке

### Вариант 1: Через Web App

1. Откройте бота: **@goldentarot_bot**
2. Отправьте команду: `/admin`
3. Бот должен отправить кнопку с ссылкой на админ-панель

### Вариант 2: Прямая ссылка

Откройте в браузере Telegram или Desktop:
```
https://t.me/goldentarot_bot?start=admin
```

### Вариант 3: Через Menu Button

Если настроено:
1. Откройте бота
2. Нажмите кнопку меню (слева от поля ввода)
3. Выберите "Admin Panel"

---

## 📊 Функционал админки

### Доступные команды бота:

| Команда | Описание |
|---------|----------|
| `/start` | Приветствие, главное меню |
| `/admin` | Доступ к админ-панели |
| `/stats` | Статистика Mini App |
| `/tarologists` | Список тарологов |
| `/addtarologist` | Добавить таролога |
| `/payouts` | Выплаты тарологам |

### Web App админка (`/admin.html`):

**URL:** `https://goldtarot.ru/admin.html`

**Функционал:**
- 📊 Общая статистика (доход, транзакции, сессии)
- 👥 Список тарологов с балансом
- ➕ Добавление/редактирование тарологов
- 💰 Выплаты тарологам
- 📈 Статистика по периодам

---

## 🔒 Безопасность

### Middleware проверки админа:

Файл: `server/server.js`

```javascript
function isAdmin(req, res, next) {
  const telegramInitData = req.headers['x-telegram-init-data'];
  
  if (!telegramInitData) {
    return res.status(401).json({ success: false, error: 'No Telegram data' });
  }
  
  // Валидация данных Telegram
  const params = new URLSearchParams(telegramInitData);
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
  
  if (computedHash !== hash) {
    return res.status(401).json({ success: false, error: 'Invalid Telegram data' });
  }
  
  // Проверка ADMIN_TELEGRAM_ID
  const userJson = params.get('user');
  if (!userJson) {
    return res.status(401).json({ success: false, error: 'No user data' });
  }
  
  const userData = JSON.parse(userJson);
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  
  // Если ADMIN_TELEGRAM_ID не установлен - разрешаем первому пользователю
  if (adminId && userData.id.toString() !== adminId) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  
  req.adminUser = userData;
  next();
}
```

---

## 🧪 Тестирование

### 1. Проверка .env

```bash
# На сервере
cat /var/www/tarot-miniapp/server/.env | grep ADMIN
```

Должно быть:
```
ADMIN_TELEGRAM_ID=123456789
```

### 2. Проверка API

```bash
# Запрос к админке (замените INIT_DATA на ваши данные Telegram)
curl -H "X-Telegram-Init-Data: <initData>" \
     https://goldtarot.ru/api/admin/stats
```

### 3. Проверка бота

Отправьте боту `/admin` — должна открыться админ-панель.

---

## 📝 Привязка Telegram ID к пользователю

### Когда приступим?

**Сейчас!** Вот план:

### Этап 1: Настройка ADMIN_TELEGRAM_ID ✅

```bash
# Выполните шаги 1-3 выше
ssh root@89.125.59.117
nano /var/www/tarot-miniapp/server/.env
# Добавьте: ADMIN_TELEGRAM_ID=<ваш ID>
pm2 restart tarot-server
```

### Этап 2: Проверка доступа к админке

```bash
# Откройте бота
https://t.me/goldentarot_bot

# Отправьте: /admin
```

### Этап 3: Добавление других админов (опционально)

Если нужно несколько админов, измените проверку в `server/server.js`:

```javascript
// Массив ID админов
const ADMIN_IDS = ['123456789', '987654321'];

// Проверка
if (adminId && !ADMIN_IDS.includes(userData.id.toString())) {
  return res.status(403).json({ success: false, error: 'Access denied' });
}
```

### Этап 4: Привязка ID к обычным пользователям

Автоматически происходит при первом взаимодействии:

**Файл:** `server/server.js`

```javascript
app.post('/api/user/init', (req, res) => {
  const { initData } = req.body;
  
  // Валидация Telegram данных
  if (!validateTelegramData(initData)) {
    return res.status(401).json({ success: false, error: 'Invalid Telegram data' });
  }
  
  const params = new URLSearchParams(initData);
  const userJson = params.get('user');
  
  if (!userJson) {
    return res.status(400).json({ success: false, error: 'No user data' });
  }
  
  const userData = JSON.parse(userJson);
  
  // Find or create пользователь с Telegram ID
  const user = User.findOrCreate(userData.id.toString(), {
    username: userData.username,
    first_name: userData.first_name,
    last_name: userData.last_name
  });
  
  res.json({ success: true, data: user });
});
```

---

## 🆘 Если что-то не работает

### Бот не отвечает на /admin

```bash
# Проверка логов бота
pm2 logs tarot-server --lines 50 | grep -i "admin\|command"

# Проверка вебхука
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### Доступ запрещён (403)

Проверьте ADMIN_TELEGRAM_ID:
```bash
cat /var/www/tarot-miniapp/server/.env | grep ADMIN
```

Убедитесь, что ID совпадает с вашим.

### Админка не открывается

Проверьте логи:
```bash
pm2 logs tarot-server --err
tail -50 /var/log/nginx/error.log
```

---

## ✅ Чек-лист настройки

```
□ Получен Telegram ID через @userinfobot
□ Добавлен ADMIN_TELEGRAM_ID в .env
□ Перезапущен сервер (pm2 restart)
□ Бот отвечает на /admin
□ Админ-панель открывается
□ Статистика отображается
□ Список тарологов доступен
```

---

**Готово! После настройки ADMIN_TELEGRAM_ID вы получите полный доступ к админке.** 🎯

---

*Дата: 2026-03-01*
*Бот: @goldentarot_bot*
*Сервер: VDS 89.125.59.117*
