#!/bin/bash

# =============================================================================
# Tarot Mini App — Настройка серверной части (API + чат)
# =============================================================================
# Этот скрипт настраивает только серверную часть для интеграции Telegram Stars
# НЕ изменяет Nginx, НЕ трогает SSL, НЕ ломает работающий сайт
# =============================================================================

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Логотип
show_logo() {
    echo -e "${CYAN}"
    echo "  _____         __       .__          __   "
    echo " /  _  \  _____/  |____  |  |   _____/  |_ "
    echo "/  /_\  \/    \   __\  \ |  | _/ __ \   __\\"
    echo "\  \_/   \   |  \  |  |  \|  |_\  ___/|  |  "
    echo " \_____  /___|  /__|  |__/|____/\___  >__|  "
    echo "       \/     \/                    \/      "
    echo -e "${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}    Настройка сервера Telegram Stars (API + чат)${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
    echo ""
}

show_step() {
    echo -e "${YELLOW}────────────────────────────────────────────────${NC}"
    echo -e "${GREEN}▶ $1${NC}"
    echo -e "${YELLOW}────────────────────────────────────────────────${NC}"
}

show_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

show_error() {
    echo -e "${RED}✗ $1${NC}"
}

show_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Проверка sudo
check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        show_error "Запустите от root: sudo bash setup-server.sh"
        exit 1
    fi
}

# Проверка Node.js
check_node() {
    if ! command -v node &> /dev/null; then
        show_error "Node.js не установлен"
        echo "Установите: curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
        exit 1
    fi
    show_success "Node.js: $(node --version)"
}

# Проверка PM2
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        show_info "Установка PM2..."
        npm install -g pm2 > /dev/null 2>&1
        show_success "PM2 установлен"
    else
        show_success "PM2: $(pm2 --version)"
    fi
}

# Запрос данных
request_data() {
    show_step "Ввод данных для настройки сервера"
    echo ""
    
    # Путь установки
    echo -n "Путь к проекту [/var/www/tarot-miniapp]: "
    read -r INSTALL_PATH
    if [ -z "$INSTALL_PATH" ]; then
        INSTALL_PATH="/var/www/tarot-miniapp"
    fi
    show_info "Путь: $INSTALL_PATH"
    
    # Проверка существования директории
    if [ ! -d "$INSTALL_PATH" ]; then
        show_error "Директория не найдена: $INSTALL_PATH"
        exit 1
    fi
    
    # Telegram Bot Token
    echo ""
    echo -e "${CYAN}Telegram Bot Token:${NC}"
    echo "Получите у @BotFather (https://t.me/BotFather)"
    echo ""
    echo -n "Bot Token: "
    read -rs TELEGRAM_BOT_TOKEN
    echo ""
    
    if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
        show_error "Token обязателен"
        exit 1
    fi
    
    # Маскированный вывод
    MASKED="${TELEGRAM_BOT_TOKEN:0:12}...${TELEGRAM_BOT_TOKEN: -6}"
    show_success "Bot Token: $MASKED"
    
    # Домен (для вебхука)
    echo ""
    echo -n "Домен [goldtarot.ru]: "
    read -r DOMAIN
    if [ -z "$DOMAIN" ]; then
        DOMAIN="goldtarot.ru"
    fi
    show_success "Домен: $DOMAIN"
    
    # Порт
    echo ""
    echo -n "Порт сервера [3001]: "
    read -r PORT
    if [ -z "$PORT" ]; then
        PORT=3001
    fi
    show_success "Порт: $PORT"
    
    # Session Secret
    echo ""
    show_info "Генерация Session Secret..."
    SESSION_SECRET=$(openssl rand -hex 32)
    show_success "Session Secret сгенерирован"
    
    # Подтверждение
    echo ""
    echo -e "${YELLOW}Проверьте данные:${NC}"
    echo "  Путь: $INSTALL_PATH"
    echo "  Домен: $DOMAIN"
    echo "  Порт: $PORT"
    echo "  Bot Token: $MASKED"
    echo ""
    echo -n "Продолжить? [y/n]: "
    read -r CONFIRM
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        show_info "Отменено"
        exit 0
    fi
}

# Создание .env
create_env() {
    show_step "Создание .env файла"
    
    cd "$INSTALL_PATH/server"
    
    # Бэкап если существует
    if [ -f ".env" ]; then
        show_info "Бэкап существующего .env..."
        cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    fi
    
    # Создание .env
    cat > .env << EOF
# Telegram Bot Token
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN

# Telegram Stars provider (не менять)
TELEGRAM_PROVIDER_TOKEN=STARS

# Вебхук для платежей
TELEGRAM_WEBHOOK_URL=https://$DOMAIN/api/payment-webhook

# Порт сервера
PORT=$PORT

# Секретный ключ для сессий
SESSION_SECRET=$SESSION_SECRET

# URL клиента (CORS)
CLIENT_URL=https://$DOMAIN
EOF
    
    # Установка прав
    chmod 600 .env
    
    show_success ".env создан: $INSTALL_PATH/server/.env"
}

# Установка зависимостей
install_deps() {
    show_step "Установка зависимостей сервера"
    
    cd "$INSTALL_PATH/server"
    
    if [ -f "package.json" ]; then
        npm install --production > /dev/null 2>&1
        show_success "Зависимости установлены"
    else
        show_error "package.json не найден в $INSTALL_PATH/server"
        exit 1
    fi
}

# Инициализация БД
init_db() {
    show_step "Инициализация базы данных"
    
    cd "$INSTALL_PATH/server"
    
    # Запуск для создания БД
    show_info "Создание базы данных..."
    node -e "import('./db.js').then(m => m.initializeTestData())" > /dev/null 2>&1 || true
    
    if [ -f "tarot.db" ]; then
        show_success "База данных создана: $INSTALL_PATH/server/tarot.db"
    else
        show_info "БД будет создана при первом запуске"
    fi
}

# Настройка PM2
setup_pm2() {
    show_step "Настройка и запуск PM2"
    
    cd "$INSTALL_PATH/server"
    
    # Проверка процесса
    if pm2 describe tarot-server > /dev/null 2>&1; then
        show_info "Процесс уже существует, перезапускаем..."
        pm2 restart tarot-server
    else
        show_info "Запуск нового процесса..."
        pm2 start server.js --name tarot-server
    fi
    
    # Сохранение
    pm2 save > /dev/null 2>&1
    
    # Автозапуск
    pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true
    
    sleep 2
    
    # Статус
    if pm2 describe tarot-server | grep -q "online"; then
        show_success "Сервер запущен"
    else
        show_error "Ошибка запуска. Проверьте логи: pm2 logs tarot-server"
    fi
}

# Настройка вебхука
setup_webhook() {
    show_step "Настройка вебхука Telegram"
    
    # Чтение токена из .env
    cd "$INSTALL_PATH/server"
    source .env
    
    WEBHOOK_URL="https://$DOMAIN/api/payment-webhook"
    
    show_info "Установка вебхука: $WEBHOOK_URL"
    
    RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=$WEBHOOK_URL")
    
    if echo "$RESPONSE" | grep -q '"ok":true'; then
        show_success "Вебхук установлен"
    else
        show_error "Ошибка: $RESPONSE"
        show_info "Проверьте токен и домен"
    fi
}

# Проверка Nginx (только проверка, не меняем!)
check_nginx() {
    show_step "Проверка Nginx (только проверка, без изменений)"
    
    # Проверка конфига
    if [ -f "/etc/nginx/sites-available/tarot-miniapp" ]; then
        show_info "Конфиг Nginx найден"
        
        # Проверка наличия /api location
        if grep -q "location /api" /etc/nginx/sites-available/tarot-miniapp; then
            show_success "API endpoint настроен"
        else
            show_warning "API endpoint НЕ найден в конфиге Nginx"
            echo ""
            echo -e "${YELLOW}Вам нужно добавить в /etc/nginx/sites-available/tarot-miniapp:${NC}"
            echo ""
            echo "    location /api {"
            echo "        proxy_pass http://localhost:$PORT;"
            echo "        proxy_http_version 1.1;"
            echo "        proxy_set_header Upgrade \$http_upgrade;"
            echo "        proxy_set_header Connection 'upgrade';"
            echo "        proxy_set_header Host \$host;"
            echo "    }"
            echo ""
            echo "После: sudo nginx -t && sudo systemctl reload nginx"
        fi
        
        # Проверка наличия /socket.io location
        if grep -q "location /socket.io" /etc/nginx/sites-available/tarot-miniapp; then
            show_success "WebSocket endpoint настроен"
        else
            show_warning "WebSocket endpoint НЕ найден в конфиге Nginx"
            echo ""
            echo -e "${YELLOW}Для работы чата добавьте в конфиг:${NC}"
            echo ""
            echo "    location /socket.io {"
            echo "        proxy_pass http://localhost:$PORT;"
            echo "        proxy_http_version 1.1;"
            echo "        proxy_set_header Upgrade \$http_upgrade;"
            echo "        proxy_set_header Connection 'upgrade';"
            echo "    }"
        fi
    else
        show_warning "Конфиг Nginx не найден"
        show_info "Сайт работает на стандартной конфигурации"
    fi
    
    # Проверка Nginx
    if nginx -t > /dev/null 2>&1; then
        show_success "Nginx конфигурация валидна"
    else
        show_error "Ошибка в конфигурации Nginx!"
    fi
}

# Итог
show_summary() {
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════${NC}"
    echo -e "${GREEN}         Настройка сервера завершена!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${CYAN}📁 Путь:${NC} $INSTALL_PATH"
    echo -e "${CYAN}🔌 Порт:${NC} $PORT"
    echo -e "${CYAN}🌐 Домен:${NC} https://$DOMAIN"
    echo ""
    echo -e "${CYAN}🔧 Команды управления:${NC}"
    echo -e "   ${BLUE}pm2 status${NC}"
    echo -e "   ${BLUE}pm2 logs tarot-server${NC}"
    echo -e "   ${BLUE}pm2 restart tarot-server${NC}"
    echo -e "   ${BLUE}pm2 stop tarot-server${NC}"
    echo ""
    echo -e "${CYAN}📊 Логи:${NC}"
    echo -e "   ${BLUE}~/.pm2/logs/tarot-server-out.log${NC}"
    echo ""
    echo -e "${CYAN}🔗 Webhook URL:${NC}"
    echo -e "   ${BLUE}https://$DOMAIN/api/payment-webhook${NC}"
    echo ""
    echo -e "${YELLOW}────────────────────────────────────────────────${NC}"
    echo -e "${YELLOW}Важно!${NC}"
    echo "Если Nginx не настроен для /api и /socket.io,"
    echo "добавьте location блоки в конфиг (см. выше)"
    echo ""
}

# Главная
main() {
    show_logo
    
    check_sudo
    check_node
    check_pm2
    
    request_data
    create_env
    install_deps
    init_db
    setup_pm2
    setup_webhook
    check_nginx
    
    show_summary
}

main
