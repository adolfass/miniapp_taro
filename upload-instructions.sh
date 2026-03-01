#!/bin/bash

# =============================================================================
# Script for uploading test instructions to VDS server
# Tarot Mini App - Test Instructions Upload Script
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SERVER_USER="root"
SERVER_IP="89.125.59.117"
SERVER_DIR="/var/www/tarot-miniapp"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Files to upload
declare -a INSTRUCTION_FILES=(
    "PAYMENTS_TEST_TO_OPENCODE.md"
    "to_opencode_agents.md"
    "DEPLOY-FEATURE.md"
    "SETUP.md"
    "VDS-SETUP.md"
    "NGINX-API-SETUP.md"
    "UPDATE-SERVER.md"
)

show_logo() {
    echo -e "${BLUE}"
    echo "  _____         __       .__          __   "
    echo " /  _  \\  _____/  |____  |  |   _____/  |_ "
    echo "/  /_\\  \\/    \\   __\\  \\ |  | _/ __ \\   __\\"
    echo "\\  \\_/   \\   |  \\  |  |  \\|  |_\\  ___/|  |  "
    echo " \\_____  /___|  /__|  |__/|____/\\___  >__|  "
    echo "       \\/     \\/                    \\/      "
    echo -e "${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}    Upload Test Instructions to VDS${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
    echo ""
}

check_connection() {
    echo -e "${YELLOW}[PRE-CHECK] Проверка подключения к серверу...${NC}"
    
    if ssh -o ConnectTimeout=5 -o BatchMode=yes ${SERVER_USER}@${SERVER_IP} "echo 'Connection successful'" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Подключение к серверу успешно${NC}"
        return 0
    else
        echo -e "${RED}❌ Не удалось подключиться к серверу${NC}"
        echo ""
        echo "Проверьте:"
        echo "  1. SSH ключи настроены (ssh-keygen, ssh-copy-id)"
        echo "  2. Сервер доступен (ping ${SERVER_IP})"
        echo "  3. Пользователь ${SERVER_USER} имеет доступ"
        echo ""
        echo "Настройка SSH ключа:"
        echo "  ssh-keygen -t ed25519"
        echo "  ssh-copy-id ${SERVER_USER}@${SERVER_IP}"
        echo ""
        return 1
    fi
}

upload_file() {
    local file=$1
    local remote_dir=$2
    
    if [ -f "$LOCAL_DIR/$file" ]; then
        echo -e "${YELLOW}Загрузка: ${file}${NC}"
        scp "$LOCAL_DIR/$file" ${SERVER_USER}@${SERVER_IP}:${remote_dir}/
        echo -e "${GREEN}✅ Загружено: ${file}${NC}"
        return 0
    else
        echo -e "${RED}❌ Файл не найден: ${file}${NC}"
        return 1
    fi
}

upload_instructions() {
    echo -e "${YELLOW}[UPLOAD] Загрузка инструкций на сервер...${NC}"
    echo ""
    
    local success_count=0
    local fail_count=0
    
    for file in "${INSTRUCTION_FILES[@]}"; do
        if upload_file "$file" "$SERVER_DIR"; then
            ((success_count++))
        else
            ((fail_count++))
        fi
        echo ""
    done
    
    echo -e "${BLUE}────────────────────────────────────────────────${NC}"
    echo -e "${GREEN}✅ Загружено файлов: ${success_count}${NC}"
    if [ $fail_count -gt 0 ]; then
        echo -e "${RED}❌ Ошибок: ${fail_count}${NC}"
    fi
    echo ""
}

set_permissions() {
    echo -e "${YELLOW}[PERMISSIONS] Настройка прав на файлы...${NC}"
    
    ssh ${SERVER_USER}@${SERVER_IP} << EOF
    cd ${SERVER_DIR}
    
    # Права на markdown файлы
    chmod 644 *.md
    
    # Права на скрипты
    if [ -f "test-payment.sh" ]; then
        chmod +x test-payment.sh
    fi
    
    if [ -f "deploy.sh" ]; then
        chmod +x deploy.sh
    fi
    
    if [ -f "setup-server.sh" ]; then
        chmod +x setup-server.sh
    fi
    
    echo "Права настроены"
EOF
    
    echo -e "${GREEN}✅ Права настроены${NC}"
    echo ""
}

verify_upload() {
    echo -e "${YELLOW}[VERIFY] Проверка загруженных файлов...${NC}"
    
    ssh ${SERVER_USER}@${SERVER_IP} << EOF
    cd ${SERVER_DIR}
    
    echo "════════════════════════════════════════════"
    echo "Файлы инструкций на сервере:"
    echo "════════════════════════════════════════════"
    
    # Проверка markdown файлов
    for file in ${INSTRUCTION_FILES[@]}; do
        if [ -f "\$file" ]; then
            SIZE=\$(wc -c < "\$file")
            echo "  ✅ \$file (\$SIZE bytes)"
        else
            echo "  ❌ \$file (не найден)"
        fi
    done
    
    echo ""
    echo "Все файлы в директории:"
    ls -lh *.md 2>/dev/null | awk '{print "  " \$9 " (" \$5 ")"}'
EOF
    
    echo ""
}

show_summary() {
    echo -e "${GREEN}════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}         Загрузка инструкций завершена!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BLUE}📁 Сервер:${NC} ${SERVER_IP}"
    echo -e "${BLUE}📂 Директория:${NC} ${SERVER_DIR}"
    echo -e "${BLUE}🔗 Сайт:${NC} https://goldtarot.ru"
    echo ""
    echo -e "${YELLOW}📚 Доступные инструкции:${NC}"
    echo "  - PAYMENTS_TEST_TO_OPENCODE.md (тестирование оплаты)"
    echo "  - to_opencode_agents.md (инструкции для Opencode)"
    echo "  - DEPLOY-FEATURE.md (деплой функционала)"
    echo "  - SETUP.md (настройка сервера)"
    echo "  - VDS-SETUP.md (настройка VDS)"
    echo "  - NGINX-API-SETUP.md (настройка Nginx)"
    echo "  - UPDATE-SERVER.md (обновление сервера)"
    echo ""
    echo -e "${YELLOW}🚀 Следующие шаги:${NC}"
    echo "  1. Подключитесь к серверу: ssh ${SERVER_USER}@${SERVER_IP}"
    echo "  2. Перейдите в директорию: cd ${SERVER_DIR}"
    echo "  3. Запустите тест: ./test-payment.sh"
    echo "  4. Или прочитайте инструкцию: cat PAYMENTS_TEST_TO_OPENCODE.md"
    echo ""
}

# Main function
main() {
    show_logo
    
    # Проверка подключения
    if ! check_connection; then
        exit 1
    fi
    
    echo ""
    
    # Загрузка инструкций
    upload_instructions
    
    # Настройка прав
    set_permissions
    
    # Проверка
    verify_upload
    
    # Итог
    show_summary
}

# Run main function
main
