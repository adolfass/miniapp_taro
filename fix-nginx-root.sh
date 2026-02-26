#!/bin/bash
# Скрипт быстрого исправления Nginx root для tarot-miniapp

echo "🔧 Исправление конфигурации Nginx..."

# Проверка прав
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Пожалуйста, запустите от root (sudo -i)"
  exit 1
fi

# Создаём правильный конфиг
cat > /etc/nginx/sites-available/tarot-miniapp << 'EOF'
server {
    listen 80;
    listen 443 ssl;
    server_name goldtarot.ru www.goldtarot.ru;

    root /var/www/tarot-miniapp/dist;
    index index.html;

    # Для Mini App (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Кэширование статики
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|webp|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip сжатие
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json image/svg+xml;
    
    # Скрытие версии Nginx
    server_tokens off;
    
    # Защита от clickjacking
    add_header X-Frame-Options "SAMEORIGIN" always;
    
    # MIME type защита
    add_header X-Content-Type-Options "nosniff" always;
}

# Redirect HTTP to HTTPS (если SSL настроен)
server {
    listen 80;
    server_name goldtarot.ru www.goldtarot.ru;
    return 301 https://$server_name$request_uri;
}
EOF

# Проверка конфига
echo "📋 Проверка конфигурации..."
nginx -t

if [ $? -eq 0 ]; then
    # Перезагрузка Nginx
    echo "🔄 Перезагрузка Nginx..."
    systemctl reload nginx
    
    echo "✅ Конфигурация обновлена!"
    echo ""
    echo "📍 Сайт доступен по адресу: https://goldtarot.ru"
else
    echo "❌ Ошибка в конфигурации Nginx!"
    exit 1
fi
