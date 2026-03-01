# Tarot Mini App — Контекст проекта

## Обзор проекта

**Telegram Mini App для гадания на картах Таро** — мистическое веб-приложение с фокусом на визуальное восприятие карт, плавные анимации (120 Гц) и карточную механику.

### Ключевые особенности
- Два расклада: ежедневный (3 карты) и на ситуацию «Путь» (7 карт)
- Оригинальная рубашка карт в мистическом стиле
- Звук перетасовки карт + возможность отключения
- Встряхивание телефона как альтернатива кнопке (имитация броска костей)
- Частицы (sparkles) при перевороте карт
- Интеграция с Telegram WebApp API
- Звёздный фон на Canvas
- **Telegram Stars интеграция** — оплата консультаций, чат с тарологом, оценка

## Технический стек

| Компонент | Технология |
|-----------|------------|
| Язык | Vanilla JavaScript (ES6+ модули) |
| Сборщик | Vite |
| Стили | CSS3 с аппаратным ускорением |
| Анимации | `transform`, `opacity`, Canvas для частиц и звёзд |
| Изображения | WebP |
| Платформа | Telegram WebApp |
| Сервер | Node.js + Express + Socket.IO |
| БД | SQLite (better-sqlite3) |
| Деплой | GitHub Pages / VDS (Nginx + PM2) |

## Структура проекта

```
miniapp/
├── public/
│   ├── index.html              # Главная страница
│   ├── admin.html              # Админ-панель
│   ├── css/
│   │   └── style.css           # Все стили (2086 строк)
│   ├── js/
│   │   ├── main.js             # Точка входа, Telegram WebApp + Mock
│   │   ├── cards.js            # Данные 78 карт (22 Старших + 56 Младших)
│   │   ├── spreads.js          # Логика раскладов
│   │   ├── animations.js       # Анимации + Canvas частицы и звёзды
│   │   ├── sound.js            # Управление звуком тасовки
│   │   ├── shake.js            # Детекция встряхивания (акселерометр)
│   │   ├── description.js      # Описание расклада «Путь»
│   │   ├── tarologists.js      # Экран выбора таролога + Mock оплаты
│   │   └── chat.js             # Чат с тарологом (WebSocket)
│   └── assets/
│       ├── card-backs/back.webp
│       ├── card-faces/major/   # Изображения Старших Арканов
│       └── sounds/shuffle.mp3  # Звук тасовки
├── server/
│   ├── server.js               # Express сервер (API + WebSocket)
│   ├── admin-bot.js            # Бот админки
│   ├── db.js                   # База данных (SQLite)
│   ├── package.json            # Зависимости сервера
│   └── .env.example            # Шаблон переменных окружения
├── .github/workflows/
│   └── deploy.yml              # CI/CD для GitHub Pages
├── dist/                       # Сборка продакшена
├── package.json
├── vite.config.js
├── README.md                   # Основная документация
├── AGENTS.md                   # Роль менеджера проекта
├── DEPLOY.md                   # Инструкция по деплою на VDS
├── SETUP.md                    # Полная инструкция по настройке
├── NGINX-API-SETUP.md          # Настройка Nginx
├── deploy.sh                   # Скрипт деплоя на сервер
└── setup-server.sh             # Скрипт настройки сервера
```

## Команды разработки

### Клиентская часть (локально, без ключей)
```bash
# Установка зависимостей
npm install

# Запуск dev-сервера (порт 3000) — работает БЕЗ ключей Telegram
npm run dev

# Сборка продакшена
npm run build

# Предпросмотр сборки
npm run preview

# Деплой на GitHub Pages
npm run deploy
```

### Серверная часть (опционально, для тестирования с реальным API)
```bash
cd server

# Установка зависимостей
npm install

# Запуск dev-сервера (порт 3001)
npm run dev
```

## Локальная разработка без ключей Telegram

При запуске через `npm run dev` приложение автоматически использует **Mock-режим**:

### 1. Mock Telegram WebApp API (`public/js/main.js`)
```javascript
window.Telegram = {
  WebApp: {
    initData: 'user=test',
    initDataUnsafe: { user: { id: 123, first_name: 'Test' } },
    colorScheme: 'dark',
    themeParams: {},
    expand: () => {},
    ready: () => {},
    showAlert: (msg) => alert(msg),
    showConfirm: (msg, callback) => callback(confirm(msg)),
    HapticFeedback: {
      impactOccurred: () => {},
      notificationOccurred: () => {}
    },
    Clipboard: {
      writeText: (text, callback) => {
        navigator.clipboard.writeText(text).then(() => callback(true));
      }
    },
    sendData: (data) => console.log('sendData:', data),
    openInvoice: (url, callback) => {
      console.log('Opening invoice:', url);
      setTimeout(() => callback('paid'), 2000); // Имитация оплаты
    }
  }
};
```

### 2. Mock тарологи (`public/js/tarologists.js`)
```javascript
function getMockTarologists() {
  return [
    {
      id: 1,
      name: 'Александра',
      photo_url: 'https://via.placeholder.com/200x200/8B5CF6/FFFFFF?text=A',
      description: 'Профессиональный таролог с 5-летним опытом...',
      rating: 4.8,
      total_ratings: 127,
      sessions_completed: 45,
      price: 48
    },
    // ... ещё 2 таролога
  ];
}
```

### 3. Mock оплаты (`public/js/tarologists.js`)
```javascript
async function confirmPayment() {
  if (import.meta.env.DEV) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    currentTransaction = {
      id: Date.now(),
      tarologistId: selectedTarologist.id,
      starsAmount: selectedTarologist.price
    };
    
    closePaymentModal();
    showPaymentSuccess();
    return;
  }
  // Реальный запрос к API...
}
```

### 4. Mock WebSocket для чата (`public/js/chat.js`)
```javascript
const wsUrl = import.meta.env.DEV
  ? 'ws://localhost:3001'  // Если сервер запущен
  : `wss://${window.location.host}`;

// В режиме DEV сообщения эмулируются локально
if (import.meta.env.DEV) {
  // Эмуляция получения сообщений
}
```

## Дизайн-система

### Цветовая палитра
- Фон: `#1a0b2e` (глубокий фиолетовый) → `#2d1f4e` (градиент)
- Акцент: `#d4af37` (золото), `#f4d06f` (светлое золото)
- Текст: `#f5f5f5` (основной), `rgba(245, 245, 245, 0.7)` (вторичный)

### Шрифты
- Заголовки: `'Cormorant Garamond', serif` (400, 600, 700)
- Магические заголовки: `'Cinzel', serif`
- Основной текст: системный шрифт

### Анимации
- Переворот карты: `0.7s cubic-bezier(0.4, 0.0, 0.2, 1)`, `transform: rotateY(180deg)`
- Частицы: Canvas, 20 частиц на переворот, время жизни ~2с
- Звёздный фон: Canvas, мерцание через `sin(phase)`
- Песочные часы: CSS keyframes, 7 секунд
- Все анимации на `transform` и `opacity` для 120 Гц
- `will-change: transform` на карточках

### Адаптивность
| Размер экрана | Карты | Особенности |
|---------------|-------|-------------|
| ≤360px | 90×144px | scale(0.85), уменьшенные отступы |
| Основной | 100×160px | Базовые размеры |
| ≥768px | 120×192px | Увеличенные размеры |

## Интеграция с Telegram

### Основные методы WebApp
```javascript
tg.expand()                              // На весь экран
tg.colorScheme                           // 'dark' | 'light'
tg.HapticFeedback.impactOccurred('light') // Тактильный отклик (light/medium/heavy)
tg.Clipboard.writeText(text, callback)   // Копирование в буфер
tg.showAlert(message)                    // Уведомление
tg.sendData(data)                        // Отправка данных боту
tg.openInvoice(url, callback)            // Открытие инвойса
```

## Расклады

### Ежедневный (3 карты)
1. Тасовка колоды (6 секунд + звук + вибрация)
2. Выбор 3 случайных карт
3. Переворот по тапу с частицами
4. Позиции: Прошлое, Настоящее, Будущее
5. Кнопки: «Поделиться с тарологом», «Новый расклад»

### На ситуацию «Путь» (7 карт, Хайо Банцхаф)
1. Тасовка колоды
2. **7-секундная концентрация** — анимация песочных часов
3. **Активация**: кнопка **или** встряхивание телефона
4. Схема расклада:
   ```
     1
   2   7
   3   6
   4   5
   ```
5. Позиции:
   - 1: Суть вопроса (центр)
   - 2-4: Прошлое (ментальный, астральный, физический уровни)
   - 5-7: Будущее (физический, астральный, ментальный уровни)

## Карты

### Старшие Арканы (22 карты)
Реализованы все 22 карты (0-21): Шут, Маг, Жрица, ..., Мир.

### Младшие Арканы (56 карт)
Генерируются динамически:
- 4 масти: Жезлы (Огонь), Кубки (Вода), Мечи (Воздух), Пентакли (Земля)
- 14 рангов: Туз-10, Паж, Рыцарь, Королева, Король

## Telegram Stars интеграция

### Поток пользователя
1. Пользователь делает расклад → нажимает «Поделиться с тарологом»
2. Экран выбора таролога (3 карточки с фото, рейтингом, ценой)
3. Выбор таролога → модальное окно подтверждения оплаты
4. Оплата через Telegram Stars API (в DEV-режиме — имитация)
5. Успешная оплата → чат с тарологом (25 минут)
6. Таймер чата → окончание консультации
7. Экран оценки таролога (1-5 звёзд)

### Распределение платежа
- **10%** — разработчик (комиссия платформы)
- **90%** — таролог

### Динамическое ценообразование
```javascript
function calculatePrice(sessionsCompleted) {
  const level = Math.floor(sessionsCompleted / 10) + 1;
  const price = 33 * Math.pow(1.1, level - 1);
  return Math.min(Math.round(price), 333); // Максимум 333 ⭐
}
```

### API эндпоинты (сервер)
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/tarologists` | Список тарологов |
| POST | `/api/create-invoice` | Создание инвойса |
| POST | `/api/payment-webhook` | Вебхук оплаты |
| POST | `/api/rate` | Оценка таролога |
| GET | `/api/session/:id/messages` | Сообщения сессии |
| GET | `/api/admin/stats` | Статистика (админ) |

## База данных (SQLite)

### Таблицы
- `tarologists` — тарологи (имя, фото, рейтинг, telegram_id, баланс)
- `users` — пользователи (telegram_id, имя)
- `transactions` — транзакции (сумма, распределение, статус)
- `chat_sessions` — сессии чата (длительность 25 мин)
- `messages` — сообщения (текст, медиа, sender_type)
- `spreads` — расклады (карты, тип)
- `payouts` — выплаты тарологам

## Звук

Файл: `public/assets/sounds/shuffle.mp3`

Особенности:
- «Разогрев» аудио при первом взаимодействии (для мобильных)
- Воспроизведение при тасовке колоды
- Отключение в настройках (шестерёнка)

## Встряхивание телефона

Модуль `shake.js`:
- Использует `DeviceMotionEvent`
- Запрос разрешения на iOS (`DeviceMotionEvent.requestPermission()`)
- Порог срабатывания: сумма дельт XYZ > 15
- Таймаут между срабатываниями: 1000 мс

## Частицы и звёзды

### Звёздный фон (`initStars`)
- Canvas на весь экран
- Количество звёзд: `area / 4000`
- Мерцание через `sin(phase)`

### Частицы при перевороте (`createParticles`)
- 20 частиц на переворот
- Цвет: золотой (`hsl(45-60, 80%, 60-80%)`)
- Физика: гравитация (`vy += 0.1`), затухание (`decay 0.02-0.04`)

## Деплой

### GitHub Pages
```bash
npm run deploy
```

### VDS (Nginx + PM2)
```bash
# На сервере
./deploy.sh

# Настройка сервера с ключами
./setup-server.sh
```

## Состояние проекта

### Реализовано ✅
- ✅ Главный экран с колодой
- ✅ Тасовка с таймером (6 сек)
- ✅ Выбор расклада
- ✅ Ежедневный расклад (3 карты)
- ✅ Расклад «Путь» (7 карт)
- ✅ Концентрация (7 сек, песочные часы)
- ✅ Активация встряхиванием
- ✅ Переворот карт с частицами
- ✅ Расширение карт по клику
- ✅ Звук тасовки
- ✅ Настройки (вкл/выкл звук)
- ✅ Описание расклада
- ✅ Telegram WebApp интеграция
- ✅ Звёздный фон
- ✅ Экран выбора таролога
- ✅ Mock оплаты (DEV-режим)
- ✅ Чат с тарологом
- ✅ Таймер чата (25 минут)
- ✅ Экран оценки таролога
- ✅ Админ-панель

### В разработке 🔲
- 🔲 Младшие Арканы (изображения)
- 🔲 Расширенные расклады
- 🔲 История раскладов

## Примечания

- **Без фреймворков** — полный контроль над анимациями
- **ES6-модули** — `import/export`
- **Аппаратное ускорение** — `translateZ(0)`, `will-change`
- **Оптимизация** — WebP, lazy loading
- **iOS-совместимость** — обработка `DeviceMotionEvent.requestPermission()`
- **Mock для локальной разработки** — работает БЕЗ ключей Telegram

## Ключевые файлы для разработки

| Файл | Назначение |
|------|------------|
| `public/js/main.js` | Точка входа, состояние, навигация, Mock Telegram |
| `public/js/cards.js` | Данные карт (78 шт) |
| `public/js/animations.js` | Canvas анимации |
| `public/js/tarologists.js` | Выбор таролога, Mock оплаты |
| `public/js/chat.js` | WebSocket чат |
| `server/server.js` | Express API + WebSocket |
| `server/db.js` | SQLite модели |
| `public/css/style.css` | Все стили (2086 строк) |
| `public/index.html` | Разметка приложения |
