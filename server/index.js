/**
 * Tarot Mini App Server
 * Модульная архитектура v5.9.3
 * Сервер для интеграции Telegram Stars и чата с тарологами
 */

// Загружаем .env ПЕРВЫМ - до всех импортов!
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import db, { initializeTestData } from './db.js';
import adminBot from './admin-bot.js';

// API Routes
import apiRouter from './api/index.js';

// WebSocket
import { initWebSocket } from './websocket/index.js';

// Bot Webhook
import { handleWebhook } from './bot/webhook.js';

// Middleware
import { autoCloseSessions } from './middleware/auto-close.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

const { startBot } = adminBot;

// ========================================
// Configuration
// ========================================

const PORT = process.env.PORT || 3001;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;
const IS_TEST_MODE = process.env.TEST_MODE === 'true';

// Логирование режима при старте
console.log(`
🚀 ${IS_TEST_MODE ? '🧪 [TEST MODE]' : '💰 [LIVE MODE]'} Tarot Mini App Server
📍 Port: ${PORT}
🤖 Bot Token: ${BOT_TOKEN ? '***' + BOT_TOKEN.slice(-5) : 'NOT SET'}
🔗 Webhook: ${WEBHOOK_URL || 'NOT SET'}
`);

// Запускаем бота только если нет webhook
if (!WEBHOOK_URL) {
  console.log('🤖 Starting bot in polling mode...');
  startBot();
} else {
  console.log('🤖 Bot will use webhook mode (no polling)');
}

// ========================================
// Express App Setup
// ========================================

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));

app.use(express.json());
app.use(autoCloseSessions);

// ========================================
// API Routes
// ========================================

app.use('/api', apiRouter);

// ========================================
// Bot Webhook
// ========================================

app.post('/api/bot/webhook', (req, res) => {
  handleWebhook(req.body);
  res.json({ ok: true });
});

// ========================================
// Error Handling
// ========================================

app.use(notFoundHandler);
app.use(errorHandler);

// ========================================
// WebSocket
// ========================================

initWebSocket(io);

// ========================================
// Startup
// ========================================

// Инициализация тестовых данных
initializeTestData();

// Настройка вебхука Telegram при старте
async function setupWebhook() {
  if (!WEBHOOK_URL || !BOT_TOKEN) {
    console.log('⚠️ Вебхук не настроен (нет WEBHOOK_URL или BOT_TOKEN)');
    return;
  }
  
  try {
    const axios = (await import('axios')).default;
    
    // Удаляем старый вебхук перед установкой нового
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);
    
    // Устанавливаем новый вебхук
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      url: WEBHOOK_URL,
      allowed_updates: ['message', 'callback_query', 'pre_checkout_query', 'successful_payment']
    });
    console.log('✅ Вебхук установлен:', WEBHOOK_URL);
  } catch (error) {
    console.error('❌ Ошибка установки вебхука:', error.message);
  }
}

// Запуск сервера
httpServer.listen(PORT, async () => {
  console.log(`✅ Server running on port ${PORT}`);
  await setupWebhook();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { app, io, httpServer };
