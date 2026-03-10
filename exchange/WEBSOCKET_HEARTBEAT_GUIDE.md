# 🔌 WebSocket Heartbeat Integration Guide

**Для:** Frontend разработчиков (Qwen/manager)  
**Дата:** 2026-03-10  
**Версия:** 1.0  
**Статус:** ✅ Готово к интеграции

---

## 🎯 Что реализовано

Переход с HTTP heartbeat (30 сек) на WebSocket heartbeat (2 мин) - более элегантное и производительное решение.

### Преимущества:
- ✅ Нет лишних HTTP-запросов
- ✅ Реальное состояние соединения
- ✅ Меньше нагрузки на батарею
- ✅ Масштабируемость

---

## 📋 API WebSocket Events

### 1. Подключение таролога

```javascript
// Когда таролог открывает приложение
socket.emit('tarologist-connect', {
  tarologistId: 123,
  initData: window.Telegram.WebApp.initData // Важно: валидный initData
});

// Сервер отвечает текущим статусом
socket.on('tarologist-status', (data) => {
  console.log('Статус:', data.is_online); // true/false
  console.log('Последний ping:', data.last_ws_ping);
});
```

### 2. Heartbeat (автоматический)

```javascript
// Клиент НЕ нужно отправлять heartbeat вручную!
// Сервер сам шлёт ping каждые 2 минуты:
socket.on('tarologist-ping', () => {
  // Отвечаем pong
  socket.emit('tarologist-pong');
});
```

### 3. Ошибки

```javascript
socket.on('error', (error) => {
  console.error('Ошибка:', error.message);
  // Возможные ошибки:
  // - 'Invalid Telegram data'
  // - 'No user data'
  // - 'Tarologist not found'
  // - 'Access denied'
});
```

---

## 💡 Пример интеграции (React/Vue)

```javascript
import io from 'socket.io-client';

class TarologistStatusService {
  constructor() {
    this.socket = null;
    this.tarologistId = null;
  }

  connect(tarologistId, initData) {
    this.tarologistId = tarologistId;
    
    // Подключаемся к серверу
    this.socket = io('https://your-server.com', {
      transports: ['websocket']
    });

    // Авторизуемся как таролог
    this.socket.emit('tarologist-connect', {
      tarologistId,
      initData
    });

    // Обрабатываем события
    this.socket.on('tarologist-status', (data) => {
      console.log('Таролог онлайн:', data.is_online);
      // Обновляем UI - показываем статус
    });

    this.socket.on('tarologist-ping', () => {
      // Автоматический ответ
      this.socket.emit('tarologist-pong');
    });

    this.socket.on('disconnect', () => {
      console.log('Отключено от сервера');
      // Пытаемся переподключиться
    });

    this.socket.on('error', (error) => {
      console.error('Ошибка WebSocket:', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Использование
const statusService = new TarologistStatusService();

// При открытии приложения тарологом
statusService.connect(tarologistId, window.Telegram.WebApp.initData);

// При закрытии приложения
window.addEventListener('beforeunload', () => {
  statusService.disconnect();
});
```

---

## 🔒 Логика определения онлайн статуса (на сервере)

Таролог считается онлайн если выполнено ХОТЯ БЫ ОДНО условие:

1. **WebSocket соединение** (`last_ws_ping` < 5 минут назад) - ПРИОРИТЕТНОЕ
2. **HTTP heartbeat** (`last_heartbeat_at` < 5 минут) - для обратной совместимости
3. **Ручное подтверждение** (`ready_until` не истёк)
4. **Активная сессия чата** (есть активная сессия в БД)

**Важно:** При disconnect WebSocket таролог НЕ сразу становится оффлайн! Даётся 5 минут таймаута на переподключение.

---

## 🧪 Тестирование

### 1. Проверка подключения
```javascript
// Откройте консоль браузера
socket.emit('tarologist-connect', {
  tarologistId: 1,
  initData: '...'
});
// Должны увидеть ответ tarologist-status
```

### 2. Проверка heartbeat
- Подождите 2 минуты
- Сервер должен отправить `tarologist-ping`
- Клиент должен ответить `tarologist-pong`

### 3. Проверка таймаута
- Закройте приложение (или отключите сеть)
- Подождите 5 минут
- Проверьте API: GET `/api/tarologist/:id/status`
- Статус должен стать `false`

---

## 📁 Изменённые файлы (бэкенд)

- ✅ `server/server.js` - WebSocket handlers
- ✅ `server/db.js` - методы wsHeartbeat(), isRealOnline()
- ✅ `server/admin-bot.js` - кнопка "Готов консультировать"

---

## ⚠️ Обратная совместимость

HTTP heartbeat endpoints оставлены для совместимости:
- `POST /api/tarologist/:id/heartbeat` - всё ещё работает
- `POST /api/tarologist/:id/ready` - ручное подтверждение
- `GET /api/tarologist/:id/status` - проверка статуса

Но рекомендуется использовать WebSocket для нового кода.

---

## 📝 TODO для фронтенда

- [ ] Добавить WebSocket подключение в приложение таролога
- [ ] Обработать событие 'tarologist-status' для отображения статуса
- [ ] Обработать 'tarologist-ping' для автоматического pong
- [ ] Добавить переподключение при разрыве соединения
- [ ] Обработать ошибки авторизации

---

**Вопросы?** Пишите в `exchange/toopencode.md`

---

*WebSocket heartbeat - профессиональное решение для production* 🚀
