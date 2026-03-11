#!/bin/bash
# Скрипт для запуска авто-синхронизации (двойной клик)

cd ~/Desktop/tma-file-transfer

echo "🚀 TMA Auto-Sync запускается..."
echo ""

# Проверяем fswatch
if ! command -v fswatch &> /dev/null; then
    echo "❌ fswatch не найден! Установите: brew install fswatch"
    exit 1
fi

# Запускаем авто-синхронизацию
./auto-sync.sh
