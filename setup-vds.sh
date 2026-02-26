#!/bin/bash
# ========================================
# Скрипт настройки сервера для Tarot Mini App
# Ubuntu 22.04
# Домен: www.goldtarot.ru
# Email: romabo51@gmail.com
# ========================================

set -e  # Остановить при ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Параметры
DOMAIN="goldtarot.ru"
WWW_DOMAIN="www.goldtarot.ru"
EMAIL="romabo51@gmail.com"
SERVER_IP="89.125.59.117"
APP_DIR="/var/www/tarot-miniapp"

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Настройка сервера для Tarot Mini App                ║${NC}"
echo -e "${BLUE}║   Домен: ${DOMAIN}                      ║${NC}"
echo -e "${BLUE}║   IP: ${SERVER_IP}                              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# ========================================
# 0. Проверка прав root
# ========================================
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}❌ Пожалуйста, запустите скрипт от root (sudo -i)${NC}"
  exit 1
fi

# ========================================
# 1. Обновление системы
# ========================================
echo -e "${YELLOW}📦 [1/10] Обновление пакетов...${NC}"
apt update && apt upgrade -y
echo -e "${GREEN}✅ Обновление завершено${NC}"
echo ""

# ========================================
# 2. Установка Node.js (версия 20 LTS)
# ========================================
echo -e "${YELLOW}📦 [2/10] Установка Node.js...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Проверка версий
echo -e "${GREEN}✅ Node.js: $(node -v)${NC}"
echo -e "${GREEN}✅ npm: $(npm -v)${NC}"
echo ""

# ========================================
# 3. Установка Nginx
# ========================================
echo -e "${YELLOW}📦 [3/10] Установка Nginx...${NC}"
apt install -y nginx

# Старт и автозапуск
systemctl start nginx
systemctl enable nginx

echo -e "${GREEN}✅ Nginx установлен и запущен${NC}"
echo ""

# ========================================
# 4. Создание директории для приложения
# ========================================
echo -e "${YELLOW}📁 [4/10] Создание директории приложения...${NC}"
mkdir -p $APP_DIR
chown -R www-data:www-data $APP_DIR
chmod -R 755 $APP_DIR

echo -e "${GREEN}✅ Директория создана: ${APP_DIR}${NC}"
echo ""

# ========================================
# 5. Настройка Nginx конфигурации
# ========================================
echo -e "${YELLOW}⚙️  [5/10] Настройка Nginx...${NC}"

cat > /etc/nginx/sites-available/tarot-miniapp << EOF
server {
    listen 80;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    root ${APP_DIR}/dist;
    index index.html;

    # Для Mini App (SPA)
    location / {
        try_files \$uri \$uri/ /index.html;
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
EOF

echo -e "${GREEN}✅ Конфигурация Nginx создана${NC}"
echo -e "${YELLOW}📄 Файл: /etc/nginx/sites-available/tarot-miniapp${NC}"
echo ""

# ========================================
# 6. Активация сайта
# ========================================
echo -e "${YELLOW}🔗 [6/10] Активация сайта...${NC}"
ln -sf /etc/nginx/sites-available/tarot-miniapp /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Проверка конфигурации
nginx -t

# Перезапуск Nginx
systemctl reload nginx

echo -e "${GREEN}✅ Nginx настроен и перезапущен${NC}"
echo ""

# ========================================
# 7. Проверка DNS
# ========================================
echo -e "${YELLOW}🔍 [7/10] Проверка DNS записей...${NC}"
echo "Проверка домена ${DOMAIN}..."

# Получаем IP для домена
DOMAIN_IP=$(dig +short ${DOMAIN} | head -n1)

if [ "$DOMAIN_IP" == "$SERVER_IP" ]; then
    echo -e "${GREEN}✅ DNS настроен правильно: ${DOMAIN} → ${SERVER_IP}${NC}"
else
    echo -e "${YELLOW}⚠️  DNS может быть ещё не обновлён${NC}"
    echo "   Ожидаемый IP: ${SERVER_IP}"
    echo "   Текущий IP: ${DOMAIN_IP:-"не определён"}"
    echo ""
    echo -e "${YELLOW}   Если домен только что куплен, подождите 15-60 минут${NC}"
    echo ""
    read -p "Продолжить установку SSL? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# ========================================
# 8. Установка Certbot (HTTPS)
# ========================================
echo -e "${YELLOW}🔒 [8/10] Установка Let's Encrypt...${NC}"
apt install -y certbot python3-certbot-nginx

echo -e "${GREEN}✅ Certbot установлен${NC}"
echo ""

# ========================================
# 9. Получение SSL сертификата
# ========================================
echo -e "${YELLOW}📜 [9/10] Получение SSL сертификата...${NC}"
echo "Домены: ${DOMAIN}, ${WWW_DOMAIN}"
echo "Email: ${EMAIL}"
echo ""

# Получение сертификата
certbot --nginx \
    -d ${DOMAIN} \
    -d ${WWW_DOMAIN} \
    --non-interactive \
    --agree-tos \
    --email ${EMAIL} \
    --redirect

echo -e "${GREEN}✅ HTTPS настроен${NC}"
echo ""

# ========================================
# 10. Загрузка файлов из репозитория
# ========================================
echo -e "${YELLOW}📦 [10/12] Загрузка файлов из репозитория...${NC}"
echo "Репозиторий: https://github.com/adolfass/miniapp_taro.git"

cd $APP_DIR

# Клонирование репозитория
git clone https://github.com/adolfass/miniapp_taro.git .

echo -e "${GREEN}✅ Файлы загружены${NC}"
echo ""

# ========================================
# 11. Установка зависимостей и сборка
# ========================================
echo -e "${YELLOW}🔨 [11/12] Установка зависимостей и сборка...${NC}"

# Установка зависимостей
npm install

# Сборка проекта
npm run build

echo -e "${GREEN}✅ Проект собран${NC}"
echo ""

# ========================================
# 12. Настройка фаервола
# ========================================
echo -e "${YELLOW}🔥 [12/12] Настройка UFW фаервола...${NC}"

ufw --force enable
ufw default allow outgoing
ufw default deny incoming
ufw allow OpenSSH
ufw allow 'Nginx Full'

echo -e "${GREEN}✅ Фаервол настроен${NC}"
echo ""

# ========================================
# 13. Создание скрипта деплоя
# ========================================
echo -e "${YELLOW}📝 [13/13] Создание скрипта деплоя...${NC}"

cat > /var/www/deploy.sh << 'DEPLOY_EOF'
#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🚀 Начало деплоя Tarot Mini App...${NC}"

cd /var/www/tarot-miniapp

# Обновление
echo -e "${YELLOW}📥 Обновление кода...${NC}"
git pull origin main

# Установка зависимостей
echo -e "${YELLOW}📦 Установка зависимостей...${NC}"
npm install

# Сборка
echo -e "${YELLOW}🔨 Сборка проекта...${NC}"
npm run build

# Проверка Nginx
echo -e "${YELLOW}✅ Проверка конфигурации Nginx...${NC}"
nginx -t

# Перезагрузка Nginx
echo -e "${YELLOW}🔄 Перезагрузка Nginx...${NC}"
systemctl reload nginx

echo -e "${GREEN}✅ Деплой завершён успешно!${NC}"
echo -e "${GREEN}📍 Приложение доступно по адресу: https://goldtarot.ru${NC}"
DEPLOY_EOF

chmod +x /var/www/deploy.sh

echo -e "${GREEN}✅ Скрипт деплоя создан: /var/www/deploy.sh${NC}"
echo ""

# ========================================
# 14. Вывод информации
# ========================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ Настройка сервера завершена!                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📍 Директория приложения:${NC} ${APP_DIR}"
echo -e "${BLUE}📍 Домен:${NC} https://${DOMAIN}"
echo -e "${BLUE}📍 WWW:${NC} https://${WWW_DOMAIN}"
echo ""
echo -e "${GREEN}✅ Приложение готово к работе!${NC}"
echo ""
echo -e "${YELLOW}📊 Полезные команды:${NC}"
echo -e "   - Логи Nginx:    ${BLUE}tail -f /var/log/nginx/error.log${NC}"
echo -e "   - Статус:        ${BLUE}systemctl status nginx${NC}"
echo -e "   - Деплой:        ${BLUE}/var/www/deploy.sh${NC}"
echo -e "   - Перезагрузка:  ${BLUE}systemctl restart nginx${NC}"
echo ""
echo -e "${GREEN}========================================${NC}"
