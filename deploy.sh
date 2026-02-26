#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║   🚀 Деплой Tarot Mini App                            ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

cd /var/www/tarot-miniapp

# 1. Обновление
echo -e "${YELLOW}[1/6] Обновление кода из GitHub...${NC}"
git pull origin main
echo -e "${GREEN}✅ Код обновлён${NC}"
echo ""

# 2. Установка зависимостей
echo -e "${YELLOW}[2/6] Установка зависимостей...${NC}"
npm install --production
echo -e "${GREEN}✅ Зависимости установлены${NC}"
echo ""

# 3. Сборка
echo -e "${YELLOW}[3/6] Сборка проекта...${NC}"
npm run build
echo -e "${GREEN}✅ Проект собран${NC}"
echo ""

# 4. Очистка
echo -e "${YELLOW}[4/6] Очистка старой сборки...${NC}"
rm -rf index.html assets/ 2>/dev/null || true
echo -e "${GREEN}✅ Очистка завершена${NC}"
echo ""

# 5. Копирование файлов
echo -e "${YELLOW}[5/6] Копирование файлов из dist...${NC}"
cp -r dist/* .
echo -e "${GREEN}✅ Файлы скопированы${NC}"
echo ""

# 6. Проверка и перезагрузка Nginx
echo -e "${YELLOW}[6/6] Проверка и перезагрузка Nginx...${NC}"
if nginx -t; then
    systemctl reload nginx
    echo -e "${GREEN}✅ Nginx перезапущен${NC}"
else
    echo -e "${RED}❌ Ошибка в конфигурации Nginx!${NC}"
    exit 1
fi
echo ""

# Итог
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ Деплой завершён успешно!                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📍 Сайт доступен: https://goldtarot.ru${NC}"
echo ""

# Проверка версии
echo -e "${YELLOW}Последний коммит:${NC}"
git log --oneline -1
