#!/bin/bash

# =============================================================================
# Tarot Mini App — Бэкап и восстановление с удалённой синхронизацией
# =============================================================================
# Этот скрипт:
# 1. Создаёт локальный бэкап базы данных, .env, Nginx конфига и PM2
# 2. Отправляет бэкап на удалённый сервер по SCP
# 3. Автоматически настраивает cron для ежедневного запуска в 3:00
# 4. Поддерживает восстановление из бэкапа
# =============================================================================

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Пути
PROJECT_DIR="/var/www/tarot-miniapp"
BACKUP_DIR="/var/backups/tarot-miniapp"
REMOTE_BACKUP_DIR="/var/backups/tarot-miniapp-remote"
SCRIPT_PATH="$(readlink -f "$0")"
CRON_FILE="/etc/cron.d/tarot-miniapp-backup"

# ========================================
# Логотип
# ========================================
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
    echo -e "${BLUE}     Tarot Mini App — Бэкап и Восстановление${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
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

show_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# ========================================
# Проверка прав root
# ========================================
check_root() {
    if [ "$EUID" -ne 0 ]; then
        show_error "Скрипт должен быть запущен от root"
        echo "Используйте: sudo bash $SCRIPT_PATH"
        exit 1
    fi
    show_success "Запуск от root подтверждён"
}

# ========================================
# Проверка зависимостей
# ========================================
check_dependencies() {
    show_info "Проверка зависимостей..."
    
    local missing=()
    
    if ! command -v tar &> /dev/null; then
        missing+=("tar")
    fi
    
    if ! command -v scp &> /dev/null; then
        missing+=("openssh-client")
    fi
    
    if ! command -v ssh-keygen &> /dev/null; then
        missing+=("openssh-client")
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        show_warning "Отсутствуют пакеты: ${missing[*]}"
        echo -n "Установить? [y/n]: "
        read -r INSTALL
        if [ "$INSTALL" = "y" ] || [ "$INSTALL" = "Y" ]; then
            apt-get update -qq && apt-get install -y -qq "${missing[@]}" > /dev/null 2>&1
            show_success "Зависимости установлены"
        else
            show_error "Установка отменена"
            exit 1
        fi
    else
        show_success "Все зависимости установлены"
    fi
}

# ========================================
# Интерактивная настройка
# ========================================
interactive_setup() {
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  Настройка удалённого бэкапа${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Режим работы
    echo -e "${CYAN}Выберите режим работы:${NC}"
    echo "1) Настроить удалённый бэкап (SCP)"
    echo "2) Только локальный бэкап"
    echo "3) Восстановление из бэкапа"
    echo "4) Создать бэкап прямо сейчас"
    echo "5) Выход"
    echo ""
    echo -n "Ваш выбор [1-5]: "
    read -r MODE
    
    case $MODE in
        1)
            setup_remote_backup
            ;;
        2)
            setup_local_backup
            ;;
        3)
            restore_backup
            ;;
        4)
            create_backup_now
            ;;
        5)
            echo "Выход"
            exit 0
            ;;
        *)
            show_error "Неверный выбор"
            exit 1
            ;;
    esac
}

# ========================================
# Настройка удалённого бэкапа
# ========================================
setup_remote_backup() {
    echo ""
    echo -e "${CYAN}Настройка удалённого бэкапа (SCP)${NC}"
    echo ""
    
    # Адрес сервера
    echo -n "Адрес удалённого сервера (например, backup.example.com или 192.168.1.100): "
    read -r REMOTE_HOST
    if [ -z "$REMOTE_HOST" ]; then
        show_error "Адрес сервера обязателен"
        exit 1
    fi
    show_success "Адрес сервера: $REMOTE_HOST"
    
    # Порт SSH
    echo -n "Порт SSH [22]: "
    read -r REMOTE_PORT
    if [ -z "$REMOTE_PORT" ]; then
        REMOTE_PORT=22
    fi
    show_success "Порт SSH: $REMOTE_PORT"
    
    # Пользователь
    echo -n "Пользователь SSH [root]: "
    read -r REMOTE_USER
    if [ -z "$REMOTE_USER" ]; then
        REMOTE_USER="root"
    fi
    show_success "Пользователь: $REMOTE_USER"
    
    # Путь на удалённом сервере
    echo -n "Путь для бэкапов на сервере [/var/backups/tarot-miniapp]: "
    read -r REMOTE_PATH
    if [ -z "$REMOTE_PATH" ]; then
        REMOTE_PATH="/var/backups/tarot-miniapp"
    fi
    show_success "Путь: $REMOTE_PATH"
    
    # SSH ключ
    echo ""
    echo -e "${CYAN}SSH ключ для подключения:${NC}"
    echo "1) Использовать существующий ключ"
    echo "2) Создать новый ключ"
    echo ""
    echo -n "Ваш выбор [1-2]: "
    read -r KEY_CHOICE
    
    case $KEY_CHOICE in
        1)
            echo -n "Путь к приватному ключу [/root/.ssh/id_rsa]: "
            read -r SSH_KEY
            if [ -z "$SSH_KEY" ]; then
                SSH_KEY="/root/.ssh/id_rsa"
            fi
            if [ ! -f "$SSH_KEY" ]; then
                show_error "Ключ не найден: $SSH_KEY"
                exit 1
            fi
            ;;
        2)
            echo -n "Email для ключа (опционально): "
            read -r KEY_EMAIL
            show_info "Генерация нового SSH ключа..."
            ssh-keygen -t ed25519 -f /root/.ssh/tarot_backup_key -N "" -C "$KEY_EMAIL" > /dev/null 2>&1
            SSH_KEY="/root/.ssh/tarot_backup_key"
            show_success "Ключ создан: $SSH_KEY"
            echo ""
            show_warning "Важно! Добавьте публичный ключ на удалённый сервер:"
            echo "  $(cat ${SSH_KEY}.pub)"
            echo ""
            echo "Команда для копирования ключа:"
            echo "  ssh-copy-id -i ${SSH_KEY}.pub -p $REMOTE_PORT $REMOTE_USER@$REMOTE_HOST"
            echo ""
            echo -n "Нажмите Enter, когда ключ будет добавлен на сервер..."
            read -r
            ;;
        *)
            show_error "Неверный выбор"
            exit 1
            ;;
    esac
    
    show_success "SSH ключ: $SSH_KEY"
    
    # Проверка подключения
    echo ""
    show_info "Проверка подключения к серверу..."
    if ssh -i "$SSH_KEY" -p "$REMOTE_PORT" -o StrictHostKeyChecking=no -o ConnectTimeout=5 "$REMOTE_USER@$REMOTE_HOST" "echo OK" > /dev/null 2>&1; then
        show_success "Подключение успешно"
        
        # Создаём директорию на удалённом сервере
        ssh -i "$SSH_KEY" -p "$REMOTE_PORT" "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $REMOTE_PATH" > /dev/null 2>&1
        show_success "Директория на сервере создана"
    else
        show_error "Не удалось подключиться к серверу"
        echo "Проверьте:"
        echo "  - Правильность адреса и порта"
        echo "  - Что публичный ключ добавлен в ~/.ssh/authorized_keys на сервере"
        echo "  - Что SSH доступен (firewall)"
        exit 1
    fi
    
    # Сохранение конфигурации
    echo ""
    show_info "Сохранение конфигурации..."
    
    cat > "$PROJECT_DIR/.backup_config" << EOF
# Tarot Mini App — Backup Configuration
# Generated: $(date)

REMOTE_HOST="$REMOTE_HOST"
REMOTE_PORT="$REMOTE_PORT"
REMOTE_USER="$REMOTE_USER"
REMOTE_PATH="$REMOTE_PATH"
SSH_KEY="$SSH_KEY"
BACKUP_MODE="remote"
EOF
    
    chmod 600 "$PROJECT_DIR/.backup_config"
    show_success "Конфигурация сохранена: $PROJECT_DIR/.backup_config"
    
    # Настройка cron
    setup_cron
    
    # Создание тестового бэкапа
    echo ""
    echo -n "Создать тестовый бэкап прямо сейчас? [y/n]: "
    read -r CREATE_NOW
    if [ "$CREATE_NOW" = "y" ] || [ "$CREATE_NOW" = "Y" ]; then
        create_backup
    fi
    
    show_summary
}

# ========================================
# Настройка локального бэкапа
# ========================================
setup_local_backup() {
    echo ""
    show_info "Настройка локального бэкапа..."
    
    cat > "$PROJECT_DIR/.backup_config" << EOF
# Tarot Mini App — Backup Configuration
# Generated: $(date)

BACKUP_MODE="local"
EOF
    
    chmod 600 "$PROJECT_DIR/.backup_config"
    show_success "Конфигурация сохранена"
    
    setup_cron
    
    echo ""
    echo -n "Создать бэкап прямо сейчас? [y/n]: "
    read -r CREATE_NOW
    if [ "$CREATE_NOW" = "y" ] || [ "$CREATE_NOW" = "Y" ]; then
        create_backup
    fi
    
    show_summary
}

# ========================================
# Настройка cron
# ========================================
setup_cron() {
    echo ""
    show_info "Настройка автоматического бэкапа..."
    
    # Создаём cron файл
    cat > "$CRON_FILE" << EOF
# Tarot Mini App — Автоматический бэкап
# Запуск каждый день в 3:00
0 3 * * * root /bin/bash $SCRIPT_PATH auto >> /var/log/tarot-backup.log 2>&1
EOF
    
    chmod 644 "$CRON_FILE"
    show_success "Cron настроен: $CRON_FILE"
    
    # Перезапускаем cron
    systemctl restart cron > /dev/null 2>&1 || service cron restart > /dev/null 2>&1
    show_success "Cron перезапущен"
    
    echo ""
    show_info "Бэкап будет выполняться каждый день в 3:00"
    echo "Логи: /var/log/tarot-backup.log"
}

# ========================================
# Создание бэкапа
# ========================================
create_backup() {
    local DATE=$(date +%Y%m%d_%H%M%S)
    local BACKUP_NAME="tarot-backup-$DATE"
    
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  Создание бэкапа${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Создаём директорию
    mkdir -p "$BACKUP_DIR"
    
    # Бэкап базы данных
    show_info "Бэкап базы данных..."
    if [ -f "$PROJECT_DIR/server/tarot.db" ]; then
        cp "$PROJECT_DIR/server/tarot.db" "$BACKUP_DIR/tarot.db.$DATE"
        cp "$PROJECT_DIR/server/tarot.db-wal" "$BACKUP_DIR/tarot.db-wal.$DATE" 2>/dev/null || true
        cp "$PROJECT_DIR/server/tarot.db-shm" "$BACKUP_DIR/tarot.db-shm.$DATE" 2>/dev/null || true
        show_success "База данных скопирована"
    else
        show_warning "База данных не найдена"
    fi
    
    # Бэкап .env
    show_info "Бэкап .env..."
    if [ -f "$PROJECT_DIR/server/.env" ]; then
        cp "$PROJECT_DIR/server/.env" "$BACKUP_DIR/.env.$DATE"
        chmod 600 "$BACKUP_DIR/.env.$DATE"
        show_success ".env скопирован"
    else
        show_warning ".env не найден"
    fi
    
    # Бэкап Nginx конфига
    show_info "Бэкап Nginx конфига..."
    if [ -f "/etc/nginx/sites-available/tarot-miniapp" ]; then
        cp "/etc/nginx/sites-available/tarot-miniapp" "$BACKUP_DIR/nginx-tarot-miniapp.$DATE"
        show_success "Nginx конфиг скопирован"
    else
        show_warning "Nginx конфиг не найден"
    fi
    
    # Бэкап PM2
    show_info "Бэкап PM2..."
    if command -v pm2 &> /dev/null; then
        pm2 save "$BACKUP_DIR/pm2.dump.$DATE" > /dev/null 2>&1 || true
        show_success "PM2 сохранён"
    fi
    
    # Создаём архив
    show_info "Создание архива..."
    cd "$BACKUP_DIR"
    tar -czf "$BACKUP_NAME.tar.gz" \
        tarot.db.$DATE \
        tarot.db-wal.$DATE \
        tarot.db-shm.$DATE \
        .env.$DATE \
        nginx-tarot-miniapp.$DATE \
        pm2.dump.$DATE \
        2>/dev/null || true
    
    # Удаляем временные файлы
    rm -f tarot.db.$DATE tarot.db-wal.$DATE tarot.db-shm.$DATE .env.$DATE nginx-tarot-miniapp.$DATE pm2.dump.$DATE
    
    # Удаляем старые бэкапы (храним 30 дней)
    find "$BACKUP_DIR" -name "tarot-backup-*.tar.gz" -mtime +30 -delete
    
    show_success "Архив создан: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
    show_success "Размер: $(du -h "$BACKUP_DIR/$BACKUP_NAME.tar.gz" | cut -f1)"
    
    # Отправка на удалённый сервер
    if [ -f "$PROJECT_DIR/.backup_config" ]; then
        source "$PROJECT_DIR/.backup_config"
        
        if [ "$BACKUP_MODE" = "remote" ]; then
            echo ""
            show_info "Отправка на удалённый сервер..."
            scp -i "$SSH_KEY" -P "$REMOTE_PORT" -o StrictHostKeyChecking=no \
                "$BACKUP_DIR/$BACKUP_NAME.tar.gz" \
                "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/" 2>/dev/null
            
            if [ $? -eq 0 ]; then
                show_success "Бэкап отправлен на $REMOTE_HOST:$REMOTE_PATH/$BACKUP_NAME.tar.gz"
            else
                show_error "Ошибка отправки на сервер"
            fi
        fi
    fi
    
    # Очистка старых бэкапов на удалённом сервере (храним 30 дней)
    if [ -f "$PROJECT_DIR/.backup_config" ] && [ "$BACKUP_MODE" = "remote" ]; then
        source "$PROJECT_DIR/.backup_config"
        ssh -i "$SSH_KEY" -p "$REMOTE_PORT" "$REMOTE_USER@$REMOTE_HOST" \
            "find $REMOTE_PATH -name 'tarot-backup-*.tar.gz' -mtime +30 -delete" 2>/dev/null || true
    fi
    
    echo ""
    show_success "Бэкап завершён!"
}

# ========================================
# Создание бэкапа прямо сейчас
# ========================================
create_backup_now() {
    # Проверяем конфигурацию
    if [ ! -f "$PROJECT_DIR/.backup_config" ]; then
        show_warning "Конфигурация не найдена"
        echo "Сначала настройте бэкап:"
        echo "  sudo bash $SCRIPT_PATH"
        exit 1
    fi
    
    create_backup
}

# ========================================
# Автоматический режим (для cron)
# ========================================
auto_backup() {
    # Проверяем конфигурацию
    if [ ! -f "$PROJECT_DIR/.backup_config" ]; then
        echo "[$(date)] Ошибка: конфигурация не найдена" 
        exit 1
    fi
    
    source "$PROJECT_DIR/.backup_config"
    create_backup
}

# ========================================
# Восстановление из бэкапа
# ========================================
restore_backup() {
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  Восстановление из бэкапа${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Показываем доступные бэкапы
    show_info "Доступные бэкапы:"
    if [ -d "$BACKUP_DIR" ] && [ "$(ls -A $BACKUP_DIR/*.tar.gz 2>/dev/null)" ]; then
        ls -lh "$BACKUP_DIR"/*.tar.gz | awk '{print "  " $9 " (" $5 ")"}'
    else
        show_warning "Бэкапы не найдены в $BACKUP_DIR"
    fi
    
    echo ""
    echo -n "Путь к файлу бэкапа: "
    read -r BACKUP_FILE
    
    if [ -z "$BACKUP_FILE" ]; then
        show_error "Файл не указан"
        exit 1
    fi
    
    if [ ! -f "$BACKUP_FILE" ]; then
        show_error "Файл не найден: $BACKUP_FILE"
        exit 1
    fi
    
    show_warning "Внимание! Текущие данные будут заменены."
    echo -n "Продолжить? [y/n]: "
    read -r CONFIRM
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        echo "Отменено"
        exit 0
    fi
    
    # Временная директория
    TEMP_DIR=$(mktemp -d)
    show_info "Распаковка бэкапа..."
    tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"
    
    # Остановка сервера
    show_info "Остановка сервера..."
    pm2 stop tarot-server 2>/dev/null || true
    
    # Восстановление базы данных
    show_info "Восстановление базы данных..."
    if ls "$TEMP_DIR"/tarot.db.* 1> /dev/null 2>&1; then
        cp "$TEMP_DIR"/tarot.db.* "$PROJECT_DIR/server/tarot.db"
        cp "$TEMP_DIR"/tarot.db-wal.* "$PROJECT_DIR/server/tarot.db-wal" 2>/dev/null || true
        cp "$TEMP_DIR"/tarot.db-shm.* "$PROJECT_DIR/server/tarot.db-shm" 2>/dev/null || true
        show_success "База данных восстановлена"
    fi
    
    # Восстановление .env
    show_info "Восстановление .env..."
    if ls "$TEMP_DIR"/.env.* 1> /dev/null 2>&1; then
        cp "$TEMP_DIR"/.env.* "$PROJECT_DIR/server/.env"
        chmod 600 "$PROJECT_DIR/server/.env"
        show_success ".env восстановлен"
    fi
    
    # Восстановление Nginx конфига
    show_info "Восстановление Nginx конфига..."
    if ls "$TEMP_DIR"/nginx-tarot-miniapp.* 1> /dev/null 2>&1; then
        cp "$TEMP_DIR"/nginx-tarot-miniapp.* /etc/nginx/sites-available/tarot-miniapp
        ln -sf /etc/nginx/sites-available/tarot-miniapp /etc/nginx/sites-enabled/
        if nginx -t > /dev/null 2>&1; then
            systemctl reload nginx
            show_success "Nginx восстановлен"
        else
            show_error "Ошибка в конфигурации Nginx"
        fi
    fi
    
    # Восстановление PM2
    show_info "Восстановление PM2..."
    if ls "$TEMP_DIR"/pm2.dump.* 1> /dev/null 2>&1; then
        pm2 restore "$TEMP_DIR"/pm2.dump.* 2>/dev/null || true
        show_success "PM2 восстановлен"
    fi
    
    # Запуск сервера
    show_info "Запуск сервера..."
    pm2 restart tarot-server
    
    # Очистка
    rm -rf "$TEMP_DIR"
    
    echo ""
    show_success "════════════════════════════════════════"
    show_success "  Восстановление завершено!"
    show_success "════════════════════════════════════════"
}

# ========================================
# Итоговая информация
# ========================================
show_summary() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                    Настройка завершена!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${CYAN}📁 Локальные бэкапы:${NC}"
    echo -e "   ${BLUE}$BACKUP_DIR${NC}"
    echo ""
    
    if [ -f "$PROJECT_DIR/.backup_config" ]; then
        source "$PROJECT_DIR/.backup_config"
        if [ "$BACKUP_MODE" = "remote" ]; then
            echo -e "${CYAN}🌐 Удалённый сервер:${NC}"
            echo -e "   ${BLUE}$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH${NC}"
            echo ""
        fi
    fi
    
    echo -e "${CYAN}⏰ Автоматический бэкап:${NC}"
    echo -e "   ${BLUE}Каждый день в 3:00${NC}"
    echo -e "   ${BLUE}Cron: $CRON_FILE${NC}"
    echo ""
    echo -e "${CYAN}📊 Логи:${NC}"
    echo -e "   ${BLUE}/var/log/tarot-backup.log${NC}"
    echo ""
    echo -e "${CYAN}🔧 Команды:${NC}"
    echo -e "   ${BLUE}sudo bash $SCRIPT_PATH${NC} — Настройка"
    echo -e "   ${BLUE}sudo bash $SCRIPT_PATH auto${NC} — Бэкап (для cron)"
    echo ""
    echo -e "${YELLOW}───────────────────────────────────────────────────────────${NC}"
    echo -e "${YELLOW}Совет:${NC}"
    echo "Проверьте логи после первого запуска:"
    echo "  tail -f /var/log/tarot-backup.log"
    echo ""
}

# ========================================
# Главная функция
# ========================================
main() {
    show_logo
    check_root
    check_dependencies
    
    # Проверяем режим запуска
    if [ "$1" = "auto" ]; then
        auto_backup
    else
        interactive_setup
    fi
}

# Запуск
main "$@"
