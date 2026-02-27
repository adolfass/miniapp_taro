#!/bin/bash

# =============================================================================
# Tarot Mini App — Интерактивный скрипт установки на VDS
# =============================================================================
# Этот скрипт автоматически:
# 1. Проверяет системные требования
# 2. Устанавливает зависимости (Node.js, Nginx, PM2)
# 3. Загружает проект с GitHub
# 4. Настраивает базу данных
# 5. Настраивает Nginx
# 6. Запускает сервер
# =============================================================================

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # Без цвета

# Логотип
show_logo() {
    echo -e "${CYAN}"
    cat << "EOF"
  _____         __       .__          __   
 /  _  \  _____/  |____  |  |   _____/  |_ 
/  /_\  \/    \   __\  \ |  | _/ __ \   __\
\  \_/   \   |  \  |  |  \|  |_\  ___/|  |  
 \_____  /___|  /__|  |__/|____/\___  >__|  
       \/     \/                    \/      
EOF
    echo -e "${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}          Скрипт установки Tarot Mini App на VDS${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Вывод шага
show_step() {
    echo -e "${YELLOW}───────────────────────────────────────────────────────────${NC}"
    echo -e "${GREEN}▶ $1${NC}"
    echo -e "${YELLOW}───────────────────────────────────────────────────────────${NC}"
}

# Вывод успеха
show_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Вывод ошибки
show_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Вывод информации
show_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Проверка наличия sudo
check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        show_error "Скрипт должен быть запущен от root или через sudo"
        echo "Используйте: sudo bash install.sh"
        exit 1
    fi
}

# Проверка операционной системы
check_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$NAME
        show_info "Операционная система: $OS"
    else
        show_error "Не удалось определить операционную систему"
        exit 1
    fi
}

# Установка зависимостей
install_dependencies() {
    show_step "Установка системных зависимостей"
    
    # Обновление пакетов
    show_info "Обновление списка пакетов..."
    apt-get update -qq
    
    # Установка Node.js
    if ! command -v node &> /dev/null; then
        show_info "Установка Node.js 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
        apt-get install -y -qq nodejs > /dev/null 2>&1
        show_success "Node.js установлен: $(node --version)"
    else
        show_success "Node.js уже установлен: $(node --version)"
    fi
    
    # Установка Nginx
    if ! command -v nginx &> /dev/null; then
        show_info "Установка Nginx..."
        apt-get install -y -qq nginx > /dev/null 2>&1
        show_success "Nginx установлен: $(nginx -v 2>&1)"
    else
        show_success "Nginx уже установлен: $(nginx -v 2>&1)"
    fi
    
    # Установка PM2
    if ! command -v pm2 &> /dev/null; then
        show_info "Установка PM2..."
        npm install -g pm2 > /dev/null 2>&1
        show_success "PM2 установлен: $(pm2 --version)"
    else
        show_success "PM2 уже установлен: $(pm2 --version)"
    fi
    
    # Установка Git
    if ! command -v git &> /dev/null; then
        show_info "Установка Git..."
        apt-get install -y -qq git > /dev/null 2>&1
        show_success "Git установлен"
    else
        show_success "Git уже установлен"
    fi
    
    # Установка Certbot
    if ! command -v certbot &> /dev/null; then
        show_info "Установка Certbot..."
        apt-get install -y -qq certbot python3-certbot-nginx > /dev/null 2>&1
        show_success "Certbot установлен"
    else
        show_success "Certbot уже установлен"
    fi
}

# Запрос данных у пользователя
request_user_data() {
    show_step "Ввод данных для настройки"
    echo ""
    
    # GitHub репозиторий
    echo -n "GitHub репозиторий (например, https://github.com/user/repo.git): "
    read -r GITHUB_REPO
    if [ -z "$GITHUB_REPO" ]; then
        GITHUB_REPO="https://github.com/adolfass/miniapp_taro.git"
        show_info "Используется репозиторий по умолчанию: $GITHUB_REPO"
    fi
    show_success "Репозиторий: $GITHUB_REPO"
    
    # Домен
    echo ""
    echo -n "Домен для сайта (например, tarot.example.com): "
    read -r DOMAIN
    if [ -z "$DOMAIN" ]; then
        show_error "Домен обязателен для заполнения"
        exit 1
    fi
    show_success "Домен: $DOMAIN"
    
    # Email для Let's Encrypt
    echo ""
    echo -n "Email для SSL сертификата: "
    read -r EMAIL
    if [ -z "$EMAIL" ]; then
        show_error "Email обязателен для заполнения"
        exit 1
    fi
    show_success "Email: $EMAIL"
    
    # Telegram Bot Token
    echo ""
    echo -e "${CYAN}Telegram Bot Token:${NC}"
    echo "Получите токен у @BotFather в Telegram"
    echo "1. Откройте @BotFather"
    echo "2. Отправьте /newbot или выберите существующего бота"
    echo "3. Скопируйте токен"
    echo ""
    echo -n "Telegram Bot Token: "
    read -rs TELEGRAM_BOT_TOKEN
    echo ""
    if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
        show_error "Bot Token обязателен для заполнения"
        exit 1
    fi
    # Маскируем токен для вывода
    MASKED_TOKEN="${TELEGRAM_BOT_TOKEN:0:10}...${TELEGRAM_BOT_TOKEN: -5}"
    show_success "Bot Token: $MASKED_TOKEN"
    
    # Session Secret
    echo ""
    show_info "Генерация секретного ключа для сессий..."
    SESSION_SECRET=$(openssl rand -hex 32)
    show_success "Session Secret сгенерирован"
    
    # Порт сервера
    echo ""
    echo -n "Порт сервера [3001]: "
    read -r PORT
    if [ -z "$PORT" ]; then
        PORT=3001
    fi
    show_success "Порт: $PORT"
    
    # Путь установки
    echo ""
    echo -n "Путь установки [/var/www/tarot-miniapp]: "
    read -r INSTALL_PATH
    if [ -z "$INSTALL_PATH" ]; then
        INSTALL_PATH="/var/www/tarot-miniapp"
    fi
    show_success "Путь установки: $INSTALL_PATH"
}

# Создание директории и клонирование репозитория
clone_repository() {
    show_step "Загрузка проекта с GitHub"
    
    # Создание директории
    if [ -d "$INSTALL_PATH" ]; then
        show_info "Директория уже существует, обновляем..."
        cd "$INSTALL_PATH"
        git pull origin main > /dev/null 2>&1
    else
        mkdir -p "$INSTALL_PATH"
        cd "$INSTALL_PATH"
        git clone "$GITHUB_REPO" . > /dev/null 2>&1
    fi
    
    show_success "Проект загружен в $INSTALL_PATH"
}

# Настройка .env файла
setup_env() {
    show_step "Настройка переменных окружения"
    
    cd "$INSTALL_PATH/server"
    
    # Создание .env из .env.example
    if [ -f ".env.example" ]; then
        cp .env.example .env
        
        # Замена значений в .env
        sed -i "s|TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN|" .env
        sed -i "s|TELEGRAM_WEBHOOK_URL=.*|TELEGRAM_WEBHOOK_URL=https://$DOMAIN/api/payment-webhook|" .env
        sed -i "s|PORT=.*|PORT=$PORT|" .env
        sed -i "s|SESSION_SECRET=.*|SESSION_SECRET=$SESSION_SECRET|" .env
        sed -i "s|CLIENT_URL=.*|CLIENT_URL=https://$DOMAIN|" .env
        
        show_success ".env файл настроен"
    else
        # Создание .env вручную
        cat > .env << EOF
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_PROVIDER_TOKEN=STARS
TELEGRAM_WEBHOOK_URL=https://$DOMAIN/api/payment-webhook
PORT=$PORT
SESSION_SECRET=$SESSION_SECRET
CLIENT_URL=https://$DOMAIN
EOF
        show_success ".env файл создан"
    fi
}

# Установка зависимостей сервера
install_server_deps() {
    show_step "Установка зависимостей сервера"
    
    cd "$INSTALL_PATH/server"
    npm install --production > /dev/null 2>&1
    
    show_success "Зависимости сервера установлены"
}

# Сборка клиентской части
build_client() {
    show_step "Сборка клиентской части"
    
    cd "$INSTALL_PATH"
    npm install --production > /dev/null 2>&1
    npm run build > /dev/null 2>&1
    
    show_success "Клиентская часть собрана"
}

# Настройка Nginx
setup_nginx() {
    show_step "Настройка Nginx"
    
    # Создание конфигурационного файла
    cat > /etc/nginx/sites-available/tarot-miniapp << EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Клиентская часть (статика)
    location / {
        root $INSTALL_PATH/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # API сервер
    location /api {
        proxy_pass http://localhost:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # WebSocket для чата
    location /socket.io {
        proxy_pass http://localhost:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
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
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
EOF

    # Активация сайта
    ln -sf /etc/nginx/sites-available/tarot-miniapp /etc/nginx/sites-enabled/
    
    # Проверка конфигурации
    if nginx -t > /dev/null 2>&1; then
        systemctl reload nginx
        show_success "Nginx настроен и перезапущен"
    else
        show_error "Ошибка в конфигурации Nginx"
        exit 1
    fi
}

# Настройка SSL
setup_ssl() {
    show_step "Настройка SSL сертификата (Let's Encrypt)"
    
    echo ""
    echo -n "Установить SSL сертификат сейчас? [y/n]: "
    read -r SETUP_SSL
    
    if [ "$SETUP_SSL" = "y" ] || [ "$SETUP_SSL" = "Y" ]; then
        show_info "Получение SSL сертификата для $DOMAIN..."
        
        if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" > /dev/null 2>&1; then
            show_success "SSL сертификат установлен"
            show_info "Сайт доступен по HTTPS: https://$DOMAIN"
        else
            show_error "Не удалось получить SSL сертификат"
            show_info "Вы можете настроить его позже: certbot --nginx -d $DOMAIN"
        fi
    else
        show_info "SSL сертификат не установлен"
        show_info "Вы можете настроить его позже: certbot --nginx -d $DOMAIN"
    fi
}

# Настройка вебхука Telegram
setup_telegram_webhook() {
    show_step "Настройка вебхука Telegram"
    
    show_info "Установка вебхука..."
    
    WEBHOOK_URL="https://$DOMAIN/api/payment-webhook"
    
    # Установка вебхука через curl
    RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=$WEBHOOK_URL")
    
    if echo "$RESPONSE" | grep -q '"ok":true'; then
        show_success "Вебхук Telegram установлен"
    else
        show_error "Не удалось установить вебхук"
        show_info "Проверьте токен бота и домен"
        show_info "Вы можете настроить позже через @BotFather"
    fi
}

# Запуск сервера через PM2
start_server() {
    show_step "Запуск сервера"
    
    cd "$INSTALL_PATH/server"
    
    # Остановка старых процессов
    pm2 delete tarot-server > /dev/null 2>&1 || true
    
    # Запуск нового процесса
    pm2 start server.js --name tarot-server
    
    # Сохранение конфигурации PM2
    pm2 save > /dev/null 2>&1
    
    # Настройка автозапуска
    pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true
    
    show_success "Сервер запущен"
    show_info "PM2 процесс: tarot-server"
    show_info "Порт: $PORT"
}

# Инициализация базы данных
init_database() {
    show_step "Инициализация базы данных"
    
    cd "$INSTALL_PATH/server"
    
    # База данных создаётся автоматически при первом запуске
    # Проверяем наличие файла
    if [ -f "tarot.db" ]; then
        show_success "База данных инициализирована"
    else
        # Ждём немного пока сервер создаст БД
        sleep 2
        if [ -f "tarot.db" ]; then
            show_success "База данных создана"
        else
            show_info "База данных будет создана при первом запросе"
        fi
    fi
}

# Вывод итоговой информации
show_summary() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                    Установка завершена!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${CYAN}📍 Сайт доступен:${NC}"
    echo -e "   ${BLUE}https://$DOMAIN${NC}"
    echo ""
    echo -e "${CYAN}🔧 Команды управления:${NC}"
    echo -e "   ${BLUE}pm2 status${NC}              - Статус процессов"
    echo -e "   ${BLUE}pm2 logs tarot-server${NC}   - Логи сервера"
    echo -e "   ${BLUE}pm2 restart tarot-server${NC} - Перезапуск сервера"
    echo -e "   ${BLUE}pm2 stop tarot-server${NC}    - Остановка сервера"
    echo ""
    echo -e "${CYAN}📁 Путь установки:${NC}"
    echo -e "   ${BLUE}$INSTALL_PATH${NC}"
    echo ""
    echo -e "${CYAN}📊 Логи:${NC}"
    echo -e "   Nginx: ${BLUE}/var/log/nginx/access.log${NC}"
    echo -e "   PM2:   ${BLUE}~/.pm2/logs/tarot-server-out.log${NC}"
    echo ""
    echo -e "${CYAN}🔐 SSL сертификат:${NC}"
    if [ "$SETUP_SSL" = "y" ] || [ "$SETUP_SSL" = "Y" ]; then
        echo -e "   ${GREEN}Установлен${NC}"
    else
        echo -e "   ${YELLOW}Не установлен${NC}"
        echo -e "   Команда: ${BLUE}certbot --nginx -d $DOMAIN${NC}"
    fi
    echo ""
    echo -e "${YELLOW}───────────────────────────────────────────────────────────${NC}"
    echo -e "${YELLOW}Следующие шаги:${NC}"
    echo "1. Настройте Web App URL в @BotFather"
    echo "2. Протестируйте бота в Telegram"
    echo "3. При необходимости настройте SSL"
    echo ""
}

# Обработка прерывания
trap_ctrl_c() {
    echo ""
    show_error "Установка прервана пользователем"
    exit 1
}

# Главная функция
main() {
    trap trap_ctrl_c INT
    
    show_logo
    
    check_sudo
    check_os
    
    request_user_data
    install_dependencies
    clone_repository
    setup_env
    install_server_deps
    build_client
    setup_nginx
    setup_telegram_webhook
    start_server
    init_database
    setup_ssl
    
    show_summary
}

# Запуск
main
