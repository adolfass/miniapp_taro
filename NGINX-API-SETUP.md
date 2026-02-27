# Инструкция по обновлению Nginx для поддержки API и WebSocket

## ⚠️ Важно

Этот файл нужен **только если** ваш Nginx ещё не настроен для проксирования API запросов и WebSocket соединений.

**Не применяйте изменения, если сайт уже работает!**

Сначала проверьте текущую конфигурацию:

```bash
sudo cat /etc/nginx/sites-available/tarot-miniapp
```

---

## Проверка необходимости изменений

### Если в конфиге уже есть:

```nginx
location /api {
    proxy_pass http://localhost:3001;
    ...
}

location /socket.io {
    proxy_pass http://localhost:3001;
    ...
}
```

**→ Ничего менять не нужно!** Сервер уже должен работать.

### Если в конфиге ТОЛЬКО:

```nginx
server {
    listen 80;
    server_name goldtarot.ru;
    
    root /var/www/tarot-miniapp;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    ...
}
```

**→ Нужно добавить location блоки для API и WebSocket.**

---

## Обновление конфигурации

### 1. Откройте конфиг

```bash
sudo nano /etc/nginx/sites-available/tarot-miniapp
```

### 2. Добавьте location блоки

Вставьте эти блоки **внутрь** `server { ... }`:

```nginx
# API сервер (Telegram Stars оплата)
location /api {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    
    # Таймауты для долгих запросов
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
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
    
    # Важно для WebSocket
    proxy_read_timeout 86400;
}
```

### 3. Проверьте конфиг

```bash
sudo nginx -t
```

Должно быть:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 4. Перезагрузите Nginx

```bash
sudo systemctl reload nginx
```

---

## Проверка работы

### 1. Проверка API

```bash
curl https://goldtarot.ru/api/tarologists
```

Должен вернуться JSON со списком тарологов.

### 2. Проверка WebSocket

Откройте консоль браузера на сайте и выполните:

```javascript
const socket = io('https://goldtarot.ru');
socket.on('connect', () => console.log('WebSocket подключён'));
```

Если видите "WebSocket подключён" — всё работает.

---

## Откат изменений

Если что-то пошло не так:

```bash
# Вернуть бэкап (если создавали)
sudo cp /etc/nginx/sites-available/tarot-miniapp.backup \
        /etc/nginx/sites-available/tarot-miniapp

# Перезагрузить Nginx
sudo systemctl reload nginx
```

---

## Примечания

1. **Порт 3001** должен быть свободен и не использоваться другими сервисами
2. **PM2 процесс** `tarot-server` должен быть запущен
3. **Firewall** должен разрешать подключения на порт 3001 (localhost достаточно)

### Проверка PM2

```bash
pm2 status
pm2 logs tarot-server
```

### Проверка порта

```bash
netstat -tlnp | grep 3001
# или
ss -tlnp | grep 3001
```
