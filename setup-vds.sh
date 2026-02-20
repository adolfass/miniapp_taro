#!/bin/bash
# ========================================
# Скрипт настройки сервера для Tarot Mini App
# Ubuntu 22.04
# ========================================

set -e  # Остановить при ошибке

echo "🚀 Начало настройки сервера для Tarot Mini App..."

# ========================================
# 1. Обновление системы
# ========================================
echo "📦 Обновление пакетов..."
sudo apt update && sudo apt upgrade -y

# ========================================
# 2. Установка Node.js (версия 20 LTS)
# ========================================
echo "📦 Установка Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка версий
echo "✅ Node.js: $(node -v)"
echo "✅ npm: $(npm -v)"

# ========================================
# 3. Установка Nginx
# ========================================
echo "📦 Установка Nginx..."
sudo apt install -y nginx

# Старт и автозапуск
sudo systemctl start nginx
sudo systemctl enable nginx

echo "✅ Nginx установлен и запущен"

# ========================================
# 4. Создание директории для приложения
# ========================================
echo "📁 Создание директории приложения..."
sudo mkdir -p /var/www/tarot-miniapp
sudo chown -R $USER:$USER /var/www/tarot-miniapp

# ========================================
# 5. Настройка Nginx конфигурации
# ========================================
echo "⚙️ Настройка Nginx..."

sudo tee /etc/nginx/sites-available/tarot-miniapp > /dev/null <<'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN.COM www.YOUR_DOMAIN.COM;

    root /var/www/tarot-miniapp;
    index index.html;

    # Для Mini App (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Кэширование статики
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|webp|svg|woff|woff2)$ {
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
}
EOF

echo "⚠️  Замените YOUR_DOMAIN.COM на ваш домен в файле:"
echo "   /etc/nginx/sites-available/tarot-miniapp"
echo ""
read -p "Нажмите Enter после замены..."

# ========================================
# 6. Активация сайта
# ========================================
echo "🔗 Активация сайта..."
sudo ln -sf /etc/nginx/sites-available/tarot-miniapp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Проверка конфигурации
sudo nginx -t

# Перезапуск Nginx
sudo systemctl reload nginx

echo "✅ Nginx настроен"

# ========================================
# 7. Установка Certbot (HTTPS)
# ========================================
echo "🔒 Установка Let's Encrypt..."
sudo apt install -y certbot python3-certbot-nginx

# ========================================
# 8. Получение SSL сертификата
# ========================================
echo "📜 Получение SSL сертификата..."
echo "⚠️  Убедитесь, что домен указывает на IP этого сервера"
echo ""
read -p "Нажмите Enter для получения сертификата..."

sudo certbot --nginx -d YOUR_DOMAIN.COM -d www.YOUR_DOMAIN.COM --non-interactive --agree-tos --email your-email@example.com

echo "✅ HTTPS настроен"

# ========================================
# 9. Настройка фаервола
# ========================================
echo "🔥 Настройка UFW фаервола..."
sudo ufw --force enable
sudo ufw default allow outgoing
sudo ufw default deny incoming
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'

echo "✅ Фаервол настроен"

# ========================================
# 10. Создание скрипта деплоя
# ========================================
echo "📝 Создание скрипта деплоя..."

cat > /var/www/deploy.sh << 'DEPLOY_EOF'
#!/bin/bash
set -e

echo "🚀 Начало деплоя..."

cd /var/www/tarot-miniapp

# Если это первый деплой - клонируем репозиторий
if [ ! -d ".git" ]; then
    echo "📦 Клонирование репозитория..."
    git clone https://github.com/adolfass/miniapp_taro.git .
fi

# Обновление
echo "📥 Обновление кода..."
git pull origin main

# Установка зависимостей
echo "📦 Установка зависимостей..."
npm install

# Сборка
echo "🔨 Сборка проекта..."
npm run build

# Проверка Nginx
echo "✅ Проверка конфигурации Nginx..."
sudo nginx -t

# Перезагрузка Nginx
echo "🔄 Перезагрузка Nginx..."
sudo systemctl reload nginx

echo "✅ Деплой завершён успешно!"
echo "📍 Приложение доступно по адресу: https://YOUR_DOMAIN.COM"
DEPLOY_EOF

chmod +x /var/www/deploy.sh

echo "✅ Скрипт деплоя создан: /var/www/deploy.sh"

# ========================================
# 11. Вывод информации
# ========================================
echo ""
echo "=========================================="
echo "✅ Настройка сервера завершена!"
echo "=========================================="
echo ""
echo "📍 Директория приложения: /var/www/tarot-miniapp"
echo "📍 Скрипт деплоя: /var/www/deploy.sh"
echo ""
echo "📋 Следующие шаги:"
echo "1. Отредактируйте /etc/nginx/sites-available/tarot-miniapp"
echo "   Замените YOUR_DOMAIN.COM на ваш домен"
echo ""
echo "2. Запустите деплой:"
echo "   sudo /var/www/deploy.sh"
echo ""
echo "3. Проверьте сайт: https://YOUR_DOMAIN.COM"
echo ""
echo "=========================================="
