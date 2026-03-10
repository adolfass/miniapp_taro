/**
 * Tarot Mini App Server
 * Сервер для интеграции Telegram Stars и чата с тарологами
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';

import db, {
  Tarologist,
  User,
  Transaction,
  ChatSession,
  Message,
  Spread,
  Payout,
  Event,
  calculatePrice,
  initializeTestData
} from './db.js';
import adminBot from './admin-bot.js';
const { handleWebhookUpdate, handleCommand } = adminBot;

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;

// 🧪 TEST MODE: Для тестирования без реальных звёзд
const IS_TEST_MODE = process.env.TEST_MODE === 'true';
const ACTUAL_BOT_TOKEN = IS_TEST_MODE && process.env.TEST_BOT_TOKEN ? process.env.TEST_BOT_TOKEN : BOT_TOKEN;

// Логирование режима при старте
console.log(`\n🚀 ${IS_TEST_MODE ? '🧪 [TEST MODE]' : '💰 [LIVE MODE]'} Tarot Mini App Server`);
console.log(`📍 Port: ${PORT}`);
console.log(`🤖 Bot Token: ${ACTUAL_BOT_TOKEN ? '***' + ACTUAL_BOT_TOKEN.slice(-5) : 'NOT SET'}`);
console.log(`🔗 Webhook: ${WEBHOOK_URL || 'NOT SET'}`);
console.log('');

// ========================================
// Middleware
// ========================================

app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));
app.use(express.json());

// Логгирование запросов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ========================================
// Утилиты
// ========================================

/**
 * Валидация данных от Telegram
 * @param {Object} initData - данные от Telegram WebApp
 * @returns {boolean}
 */
function validateTelegramData(initData) {
  if (!initData) return false;
  
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();
  
  const computedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  
  return computedHash === hash;
}

/**
 * Отправка сообщения через бота
 * @param {string} telegramId - ID пользователя/таролога
 * @param {string} text - текст сообщения
 */
async function sendTelegramMessage(telegramId, text) {
  if (!BOT_TOKEN || !telegramId) return;

  try {
    await axios.post(`https://api.telegram.org/bot${ACTUAL_BOT_TOKEN}/sendMessage`, {
      chat_id: telegramId,
      text
    });
  } catch (error) {
    console.error('Ошибка отправки сообщения в Telegram:', error.message);
  }
}

/**
 * Запрос к Telegram API
 * @param {string} method - метод API
 * @param {Object} data - данные запроса
 * @returns {Promise<Object>}
 */
async function callTelegram(method, data = {}) {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${ACTUAL_BOT_TOKEN}/${method}`,
      data
    );
    return response.data;
  } catch (error) {
    console.error(`Telegram API error (${method}):`, error.response?.data || error.message);
    return null;
  }
}

// ========================================
// API Routes
// ========================================

/**
 * GET /api/tarologists
 * Получить список всех тарологов
 */
app.get('/api/tarologists', (req, res) => {
  try {
    const tarologists = Tarologist.getAll();
    res.json({ success: true, data: tarologists });
  } catch (error) {
    console.error('Ошибка получения тарологов:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/tarologists/:id
 * Получить таролога по ID
 */
app.get('/api/tarologists/:id', (req, res) => {
  try {
    const tarologist = Tarologist.getById(req.params.id);
    
    if (!tarologist) {
      return res.status(404).json({ success: false, error: 'Tarologist not found' });
    }
    
    res.json({ success: true, data: tarologist });
  } catch (error) {
    console.error('Ошибка получения таролога:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/user/init
 * Инициализация пользователя (find or create)
 */
app.post('/api/user/init', (req, res) => {
  try {
    const { initData } = req.body;
    
    if (!validateTelegramData(initData)) {
      return res.status(401).json({ success: false, error: 'Invalid Telegram data' });
    }
    
    const params = new URLSearchParams(initData);
    const userJson = params.get('user');
    
    if (!userJson) {
      return res.status(400).json({ success: false, error: 'No user data' });
    }
    
    const userData = JSON.parse(userJson);
    const user = User.findOrCreate(userData.id.toString(), {
      username: userData.username,
      first_name: userData.first_name,
      last_name: userData.last_name
    });
    
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Ошибка инициализации пользователя:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/create-invoice
 * Создание инвойса для оплаты
 */
app.post('/api/create-invoice', async (req, res) => {
  try {
    const { tarologistId, userId, initData } = req.body;
    
    // Валидация Telegram данных
    if (!validateTelegramData(initData)) {
      return res.status(401).json({ success: false, error: 'Invalid Telegram data' });
    }
    
    const tarologist = Tarologist.getById(tarologistId);
    if (!tarologist) {
      return res.status(404).json({ success: false, error: 'Tarologist not found' });
    }
    
    // Проверяем, что таролог онлайн
    if (!tarologist.is_online) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tarologist is offline',
        errorCode: 'TAROLOGIST_OFFLINE',
        message: 'К сожалению, таролог сейчас оффлайн. Пожалуйста, выберите другого таролога или попробуйте позже.'
      });
    }
    
    const user = User.findOrCreate(
      JSON.parse(new URLSearchParams(initData).get('user')).id.toString(),
      {}
    );
    
    // Расчёт распределения платежа
    const starsAmount = tarologist.price;
    const developerCut = Math.round(starsAmount * 0.1); // 10%
    const tarologistCut = starsAmount - developerCut; // 90%
    
    // Создаём транзакцию в БД
    const transaction = Transaction.create({
      userId: user.id,
      tarologistId: tarologist.id,
      amount: starsAmount,
      starsAmount,
      developerCut,
      tarologistCut,
      status: 'pending'
    });
    
    // DEBUG: Log data before creating invoice
    console.log('🔍 SERVER DEBUG: Creating invoice with data:');
    console.log('🔍 SERVER DEBUG: user.telegram_id:', user.telegram_id);
    console.log('🔍 SERVER DEBUG: user.id:', user.id);
    console.log('🔍 SERVER DEBUG: tarologist.id:', tarologist.id);
    console.log('🔍 SERVER DEBUG: tarologist.price:', tarologist.price);
    console.log('🔍 SERVER DEBUG: starsAmount:', starsAmount);
    console.log('🔍 SERVER DEBUG: transaction.id:', transaction.id);
    
    // Validate data
    if (!user.telegram_id) {
      console.error('❌ SERVER DEBUG: user.telegram_id is missing!');
      return res.status(400).json({
        success: false,
        error: 'User Telegram ID not found. Please open app from Telegram.'
      });
    }
    
    if (!starsAmount || starsAmount <= 0) {
      console.error('❌ SERVER DEBUG: Invalid starsAmount:', starsAmount);
      return res.status(400).json({
        success: false,
        error: 'Invalid price amount'
      });
    }
    
    // Создаём инвойс через Telegram API (createInvoiceLink для получения URL)
    const invoiceData = {
      title: 'Консультация таролога',
      description: `Консультация с тарологом ${tarologist.name} (25 минут)`,
      payload: `tarot_session_${transaction.id}`,
      provider_token: '',  // Empty for Telegram Stars
      currency: 'XTR',
      prices: [
        { label: 'Консультация', amount: starsAmount }
      ]
    };
    
    console.log('🔍 SERVER DEBUG: Creating invoice link:', JSON.stringify(invoiceData, null, 2));
    
    const response = await axios.post(
      `https://api.telegram.org/bot${ACTUAL_BOT_TOKEN}/createInvoiceLink`,
      invoiceData
    );
    
    // DEBUG: Log Telegram API response
    console.log('🔍 SERVER DEBUG: Telegram API response:', JSON.stringify(response.data, null, 2));
    
    // Check if Telegram returned error
    if (!response.data.ok) {
      console.error('❌ SERVER DEBUG: Telegram API error:', response.data.description);
      return res.status(500).json({
        success: false,
        error: `Telegram API error: ${response.data.description}`
      });
    }
    
    // Получаем URL инвойса
    const invoiceUrl = response.data.result;
    console.log('✅ SERVER: Invoice link created:', invoiceUrl);
    
    res.json({
      success: true,
      data: {
        transactionId: transaction.id,
        invoiceLink: invoiceUrl, // URL для tg.openInvoice()
        starsAmount
      }
    });
  } catch (error) {
    console.error('Ошибка создания инвойса:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.description || 'Failed to create invoice' 
    });
  }
});

/**
 * POST /api/payment-webhook
 * Вебхук от Telegram о статусе платежа
 */
app.post('/api/payment-webhook', async (req, res) => {
  try {
    const update = req.body;

    // 📝 ПОДРОБНОЕ ЛОГИРОВАНИЕ
    console.log('💰 PAYMENT WEBHOOK', {
      type: update.pre_checkout_query ? 'PRE_CHECKOUT' :
            update.message?.successful_payment ? 'SUCCESSFUL_PAYMENT' :
            update.message?.invoice?.status === 'cancelled' ? 'CANCELLED' :
            update.message?.text?.startsWith('/refund') ? 'REFUND' :
            'UNKNOWN',
      timestamp: new Date().toISOString(),
      chatId: update.message?.chat?.id || update.message?.from?.id || 'N/A',
      data: JSON.stringify(update, null, 2)
    });

    // 0. Обработка команд бота (если это сообщение с командой)
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const [command, ...args] = update.message.text.split(' ');

      console.log(`📩 Получена команда: ${command} от chat_id: ${chatId}`);

      // Обрабатываем команды
      await handleCommand(chatId, command.toLowerCase(), args);
    }

    // 1. Pre-checkout query (подтверждение перед оплатой)
    if (update.pre_checkout_query) {
      // Подтверждаем pre-checkout query
      await axios.post(`https://api.telegram.org/bot${ACTUAL_BOT_TOKEN}/answerPreCheckoutQuery`, {
        pre_checkout_query_id: update.pre_checkout_query.id,
        ok: true
      });
      console.log(`✅ Pre-checkout подтверждён: ${update.pre_checkout_query.id}`);
      return res.json({ ok: true });
    }

    // 2. Успешная оплата
    if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;
      const transactionId = parseInt(payment.invoice_payload.replace('tarot_session_', ''));

      // 🔒 ПРОВЕРКА ИДЕМПОТЕНТНОСТИ: Не обработан ли уже этот платёж
      const existingTransaction = Transaction.getByTelegramPaymentId(payment.telegram_payment_charge_id);
      if (existingTransaction) {
        console.log(`⚠️ Платёж уже обработан: ${payment.telegram_payment_charge_id} (транзакция ${existingTransaction.id})`);
        return res.json({ ok: true }); // Возвращаем OK, но не обрабатываем повторно
      }

      const transaction = Transaction.getById(transactionId);
      if (!transaction) {
        return res.status(404).json({ ok: false, error: 'Transaction not found' });
      }

      // Обновляем статус транзакции
      Transaction.updateStatus(transactionId, 'completed', payment.telegram_payment_charge_id);

      // Создаём сессию чата
      const chatSession = ChatSession.create({
        userId: transaction.user_id,
        tarologistId: transaction.tarologist_id,
        durationSeconds: 1500 // 25 минут
      });

      // Уведомляем таролога
      const tarologist = Tarologist.getById(transaction.tarologist_id);
      if (tarologist?.telegram_id) {
        sendTelegramMessage(
          tarologist.telegram_id,
          `🔮 Новая консультация!\n\nКлиент оплатил сессию.\nСессия ID: ${chatSession.id}\nНачните чат в приложении.`
        );
      }

      console.log(`✅ Платёж успешен. Сессия ${chatSession.id} создана. Payment ID: ${payment.telegram_payment_charge_id}`);
    }

    // 3. Отмена оплаты (пользователь отменил после pre-checkout)
    if (update.message?.invoice?.status === 'cancelled') {
      const invoice = update.message.invoice;
      const transactionId = parseInt(invoice.payload.replace('tarot_session_', ''));

      const transaction = Transaction.getById(transactionId);
      if (transaction) {
        // Обновляем статус на cancelled
        Transaction.updateStatus(transactionId, 'cancelled');
        console.log(`❌ Оплата отменена. Транзакция ${transactionId}`);
      }
    }

    // 4. Возврат средств (Refund) - через бота админки
    if (update.message?.text?.startsWith('/refund')) {
      // Обработка команды возврата через бота
      const parts = update.message.text.split(' ');
      const transactionId = parseInt(parts[1]);

      if (transactionId) {
        const transaction = Transaction.getById(transactionId);
        if (transaction && transaction.status === 'completed') {
          // ⚠️ ОБРАБОТКА ОШИБОК API: Возврат средств через Telegram API
          try {
            const refundResult = await axios.post(
              `https://api.telegram.org/bot${ACTUAL_BOT_TOKEN}/refundStarPayment`,
              {
                user_id: transaction.user_telegram_id,
                telegram_payment_charge_id: transaction.telegram_payment_id
              },
              {
                timeout: 10000, // 10 секунд таймаут
                validateStatus: (status) => status < 500 // Не считать 4xx ошибкой сети
              }
            );

            if (refundResult.data.ok) {
              // Обновляем статус транзакции
              Transaction.updateStatus(transactionId, 'refunded');

              // Завершаем сессию если была
              const session = ChatSession.getActiveByUser(transaction.user_id);
              if (session) {
                ChatSession.markCompleted(session.id);
              }

              console.log(`💰 Возврат средств выполнен. Транзакция ${transactionId}`);
            } else {
              console.error('❌ Ошибка возврата:', {
                error: refundResult.data.description || 'Unknown error',
                transactionId,
                timestamp: new Date().toISOString()
              });
            }
          } catch (error) {
            console.error('❌ Ошибка сети при возврате:', {
              error: error.message,
              transactionId,
              user_id: transaction.user_telegram_id,
              timestamp: new Date().toISOString()
            });
            // Логировать ошибку для повторной попытки
            // Можно сохранить в отдельную таблицу для retry
          }
        }
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Ошибка обработки вебхука:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * POST /api/rate
 * Оценка таролога после сессии
 */
app.post('/api/rate', (req, res) => {
  try {
    const { tarologistId, userId, rating, sessionId } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'Invalid rating' });
    }
    
    // Обновляем рейтинг
    Tarologist.updateRating(tarologistId, rating);
    
    // Увеличиваем счётчик сессий
    Tarologist.incrementSessions(tarologistId);
    
    // Завершаем сессию
    if (sessionId) {
      ChatSession.markCompleted(sessionId);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка оценки:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/session/:id/messages
 * Получить сообщения сессии
 */
app.get('/api/session/:id/messages', (req, res) => {
  try {
    const messages = Message.getBySession(parseInt(req.params.id));
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Ошибка получения сообщений:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ========================================
// Public API Routes
// ========================================

/**
 * POST /api/track
 * Трекинг событий пользователя (app_open, spread_selected, payment_completed, etc.)
 */
app.post('/api/track', async (req, res) => {
  try {
    const { event_type, event_data } = req.body;
    const telegramInitData = req.headers['x-telegram-init-data'];

    if (!telegramInitData) {
      return res.status(401).json({ success: false, error: 'No Telegram data' });
    }

    // Получаем user_id из initData
    const params = new URLSearchParams(telegramInitData);
    const userJson = params.get('user');

    if (!userJson) {
      return res.status(400).json({ success: false, error: 'No user data' });
    }

    const userData = JSON.parse(userJson);
    const userId = userData.id.toString();

    // Находим или создаём пользователя
    const user = User.findOrCreate(userId, {
      username: userData.username,
      first_name: userData.first_name,
      last_name: userData.last_name
    });

    // Создаём событие
    const event = Event.create({
      userId: user.id,
      eventType: event_type,
      eventData: event_data || {}
    });

    console.log(`📊 Event tracked: ${event_type} (user: ${userId})`);

    res.json({ success: true, eventId: event.id });
  } catch (error) {
    console.error('Track event error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ========================================
// Admin API Routes
// ========================================

/**
 * POST /api/admin/check-auth
 * Проверка авторизации администратора
 */
app.post('/api/admin/check-auth', (req, res) => {
  try {
    const telegramInitData = req.headers['x-telegram-init-data'];

    if (!telegramInitData) {
      return res.status(401).json({ 
        success: false, 
        error: 'Требуется авторизация через Telegram' 
      });
    }

    // Валидация данных Telegram
    const params = new URLSearchParams(telegramInitData);
    const hash = params.get('hash');
    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    const computedHash = crypto.createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== hash) {
      return res.status(401).json({ 
        success: false, 
        error: 'Неверные данные Telegram' 
      });
    }

    // Проверяем, что это админ
    const userJson = params.get('user');
    if (!userJson) {
      return res.status(401).json({ 
        success: false, 
        error: 'Нет данных пользователя' 
      });
    }

    const userData = JSON.parse(userJson);
    const adminId = process.env.ADMIN_TELEGRAM_ID;

    // Если ADMIN_TELEGRAM_ID не установлен - разрешаем первому пользователю
    if (adminId && userData.id.toString() !== adminId) {
      console.log(`⚠️ Попытка доступа неавторизованного пользователя: ${userData.id} (${userData.first_name})`);
      return res.status(403).json({ 
        success: false, 
        error: 'Доступ запрещён. Ваш Telegram ID не внесён в список администраторов.' 
      });
    }

    // Успешная авторизация
    console.log(`✅ Админ авторизован: ${userData.id} (${userData.first_name})`);
    
    res.json({
      success: true,
      data: {
        user: {
          id: userData.id,
          first_name: userData.first_name,
          last_name: userData.last_name,
          username: userData.username
        },
        isAdmin: true
      }
    });
  } catch (error) {
    console.error('Ошибка авторизации:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

/**
 * Middleware для проверки администратора
 */
function isAdmin(req, res, next) {
  const telegramInitData = req.headers['x-telegram-init-data'];

  if (!telegramInitData) {
    return res.status(401).json({ success: false, error: 'No Telegram data' });
  }

  // Валидация данных Telegram
  const params = new URLSearchParams(telegramInitData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();

  const computedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) {
    return res.status(401).json({ success: false, error: 'Invalid Telegram data' });
  }

  // Проверяем, что это админ (по ID из .env или первый пользователь)
  const userJson = params.get('user');
  if (!userJson) {
    return res.status(401).json({ success: false, error: 'No user data' });
  }

  const userData = JSON.parse(userJson);
  const adminId = process.env.ADMIN_TELEGRAM_ID;

  // Если ADMIN_TELEGRAM_ID не установлен - разрешаем первому пользователю
  if (adminId && userData.id.toString() !== adminId) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  req.adminUser = userData;
  next();
}

/**
 * GET /api/admin/stats
 * Получить общую статистику для админки
 */
app.get('/api/admin/stats', isAdmin, (req, res) => {
  try {
    // Общий доход (все завершённые транзакции, исключая возвращенные)
    const revenueStmt = db.prepare(`
      SELECT
        COALESCE(SUM(stars_amount), 0) as total,
        COALESCE(SUM(developer_cut), 0) as dev_cut,
        COALESCE(SUM(tarologist_cut), 0) as taro_cut
      FROM transactions
      WHERE status = 'completed'
    `);
    const revenue = revenueStmt.get();

    // Возвраты (количество и сумма)
    const refundsStmt = db.prepare(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(stars_amount), 0) as total
      FROM transactions
      WHERE status = 'refunded'
    `);
    const refunds = refundsStmt.get();

    // Количество тарологов
    const tarologistsStmt = db.prepare('SELECT COUNT(*) as count FROM tarologists');
    const totalTarologists = tarologistsStmt.get().count;

    // Количество консультаций
    const sessionsStmt = db.prepare('SELECT COUNT(*) as count FROM chat_sessions WHERE completed = 1');
    const totalSessions = sessionsStmt.get().count;

    // Сумма к выплате (баланс всех тарологов, исключая возвращенные транзакции)
    const payoutStmt = db.prepare(`
      SELECT
        COALESCE(SUM(tr.tarologist_cut), 0) - COALESCE(SUM(p.amount), 0) as total_payout
      FROM tarologists t
      LEFT JOIN transactions tr ON t.id = tr.tarologist_id AND tr.status = 'completed' AND tr.status != 'refunded'
      LEFT JOIN payouts p ON t.id = p.tarologist_id AND p.status = 'completed'
    `);
    const totalPayout = payoutStmt.get().total_payout || 0;

    res.json({
      totalRevenue: revenue.total,
      developerCut: revenue.dev_cut,
      tarologistCut: revenue.tar_cut,
      totalRefunds: refunds.count,
      totalRefundsAmount: refunds.total,
      totalTarologists,
      totalSessions,
      totalPayout
    });
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ========================================
// Statistics API (DAU, WAU, MAU, Revenue, etc.)
// ========================================

/**
 * GET /api/admin/stats/dau
 * Daily Active Users за N дней
 */
app.get('/api/admin/stats/dau', isAdmin, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const stmt = db.prepare(`
      SELECT 
        strftime('%Y-%m-%d', created_at) as date,
        COUNT(DISTINCT user_id) as users,
        COUNT(*) as events
      FROM events
      WHERE event_type = 'app_open'
        AND created_at >= datetime('now', '-${days} days')
      GROUP BY date
      ORDER BY date ASC
    `);

    const data = stmt.all();
    res.json({ success: true, data });
  } catch (error) {
    console.error('DAU stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats/wau
 * Weekly Active Users за N недель
 */
app.get('/api/admin/stats/wau', isAdmin, (req, res) => {
  try {
    const weeks = parseInt(req.query.weeks) || 12;

    const stmt = db.prepare(`
      SELECT 
        strftime('%Y-%W', created_at) as week,
        COUNT(DISTINCT user_id) as users,
        COUNT(*) as events
      FROM events
      WHERE event_type = 'app_open'
        AND created_at >= datetime('now', '-${weeks} weeks')
      GROUP BY week
      ORDER BY week ASC
    `);

    const data = stmt.all();
    res.json({ success: true, data });
  } catch (error) {
    console.error('WAU stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats/mau
 * Monthly Active Users за N месяцев
 */
app.get('/api/admin/stats/mau', isAdmin, (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;

    const stmt = db.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(DISTINCT user_id) as users,
        COUNT(*) as events
      FROM events
      WHERE event_type = 'app_open'
        AND created_at >= datetime('now', '-${months} months')
      GROUP BY month
      ORDER BY month ASC
    `);

    const data = stmt.all();
    res.json({ success: true, data });
  } catch (error) {
    console.error('MAU stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats/revenue
 * Доход по периодам
 */
app.get('/api/admin/stats/revenue', isAdmin, (req, res) => {
  try {
    const period = req.query.period || 'monthly'; // daily, weekly, monthly
    const limit = parseInt(req.query.limit) || 12;

    const format = period === 'daily' ? '%Y-%m-%d' : period === 'weekly' ? '%Y-%W' : '%Y-%m';
    const dateCalc = period === 'daily' ? `${limit} days` : period === 'weekly' ? `${limit} weeks` : `${limit} months`;

    const stmt = db.prepare(`
      SELECT 
        strftime('${format}', created_at) as period,
        COUNT(*) as transactions,
        SUM(stars_amount) as revenue,
        SUM(developer_cut) as developer_cut,
        SUM(tarologist_cut) as tarologist_cut
      FROM transactions
      WHERE status = 'completed'
        AND created_at >= datetime('now', '-${dateCalc}')
      GROUP BY period
      ORDER BY period ASC
    `);

    const data = stmt.all();
    res.json({ success: true, data, period });
  } catch (error) {
    console.error('Revenue stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats/top-tarologists
 * Топ тарологов по доходу
 */
app.get('/api/admin/stats/top-tarologists', isAdmin, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 3;

    const stmt = db.prepare(`
      SELECT 
        t.id,
        t.name,
        t.photo_url,
        COUNT(tr.id) as consultations,
        SUM(tr.stars_amount) as total_revenue,
        SUM(tr.tarologist_cut) as total_earned
      FROM tarologists t
      LEFT JOIN transactions tr ON t.id = tr.tarologist_id AND tr.status = 'completed'
      GROUP BY t.id
      ORDER BY total_revenue DESC
      LIMIT ?
    `);

    const data = stmt.all(limit);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Top tarologists error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats/funnel
 * Воронка: app_open → spread_selected → cards_flipped → payment_completed
 */
app.get('/api/admin/stats/funnel', isAdmin, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const funnel = {
      app_open: 0,
      spread_selected: 0,
      cards_flipped: 0,
      payment_completed: 0
    };

    // Считаем каждое событие
    Object.keys(funnel).forEach(eventType => {
      const stmt = db.prepare(`
        SELECT COUNT(DISTINCT user_id) as count
        FROM events
        WHERE event_type = ?
          AND created_at >= datetime('now', '-${days} days')
      `);
      const result = stmt.get(eventType);
      funnel[eventType] = result ? result.count : 0;
    });

    // Конверсии
    const conversion = {
      app_to_spread: funnel.app_open > 0 ? ((funnel.spread_selected / funnel.app_open) * 100).toFixed(1) : 0,
      spread_to_flip: funnel.spread_selected > 0 ? ((funnel.cards_flipped / funnel.spread_selected) * 100).toFixed(1) : 0,
      flip_to_payment: funnel.cards_flipped > 0 ? ((funnel.payment_completed / funnel.cards_flipped) * 100).toFixed(1) : 0,
      app_to_payment: funnel.app_open > 0 ? ((funnel.payment_completed / funnel.app_open) * 100).toFixed(1) : 0
    };

    res.json({ success: true, data: { funnel, conversion }, period: `${days} days` });
  } catch (error) {
    console.error('Funnel stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats/conversion
 * Конверсия в целевое действие
 */
app.get('/api/admin/stats/conversion', isAdmin, (req, res) => {
  try {
    const target = req.query.target || 'payment_completed';
    const days = parseInt(req.query.days) || 30;

    // Пользователи открывшие приложение
    const appOpenStmt = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM events
      WHERE event_type = 'app_open'
        AND created_at >= datetime('now', '-${days} days')
    `);
    const appOpen = appOpenStmt.get().count;

    // Пользователи совершившие целевое действие
    const targetStmt = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM events
      WHERE event_type = ?
        AND created_at >= datetime('now', '-${days} days')
    `);
    const targetCount = targetStmt.get(target)?.count || 0;

    const conversion = appOpen > 0 ? ((targetCount / appOpen) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        target,
        app_open: appOpen,
        target_completed: targetCount,
        conversion_rate: parseFloat(conversion)
      },
      period: `${days} days`
    });
  } catch (error) {
    console.error('Conversion stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats/ltv
 * Lifetime Value — средний доход с пользователя
 */
app.get('/api/admin/stats/ltv', isAdmin, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    // Общее количество уникальных пользователей
    const totalUsersStmt = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM events
      WHERE event_type = 'app_open'
    `);
    const totalUsers = totalUsersStmt.get().count;

    // Общий доход
    const revenueStmt = db.prepare(`
      SELECT COALESCE(SUM(stars_amount), 0) as total
      FROM transactions
      WHERE status = 'completed'
        AND created_at >= datetime('now', '-${days} days')
    `);
    const totalRevenue = revenueStmt.get().total;

    // Платящие пользователи
    const payingUsersStmt = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM transactions
      WHERE status = 'completed'
        AND created_at >= datetime('now', '-${days} days')
    `);
    const payingUsers = payingUsersStmt.get().count;

    // LTV = Общий доход / Общее количество пользователей
    const ltv = totalUsers > 0 ? (totalRevenue / totalUsers).toFixed(2) : 0;

    // ARPPU (Average Revenue Per Paying User) = Доход / Платящие пользователи
    const arppu = payingUsers > 0 ? (totalRevenue / payingUsers).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        ltv: parseFloat(ltv),
        arppu: parseFloat(arppu),
        total_users: totalUsers,
        paying_users: payingUsers,
        total_revenue: totalRevenue,
        paying_rate: totalUsers > 0 ? ((payingUsers / totalUsers) * 100).toFixed(2) : 0
      },
      period: `${days} days`
    });
  } catch (error) {
    console.error('LTV stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/tarologists
 * Получить список тарологов с балансом
 */
app.get('/api/admin/tarologists', isAdmin, (req, res) => {
  try {
    const tarologists = Tarologist.getAll();

    // Добавляем баланс для каждого
    const tarologistsWithBalance = tarologists.map(t => ({
      ...t,
      balance: Payout.getTarologistBalance(t.id)
    }));

    res.json(tarologistsWithBalance);
  } catch (error) {
    console.error('Ошибка получения тарологов:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/telegram-user/:id
 * Получить данные пользователя из Telegram по ID
 */
app.get('/api/admin/telegram-user/:id', isAdmin, async (req, res) => {
  try {
    const telegramId = req.params.id;
    console.log('🔍 SERVER: Fetching Telegram user data for ID:', telegramId);

    // Проверяем, есть ли пользователь в нашей базе
    const user = User.getByTelegramId(telegramId);
    if (user) {
      console.log('✅ SERVER: User found in database:', user);
      return res.json({
        id: user.id,
        telegram_id: user.telegram_id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        photo_url: user.photo_url || null
      });
    }

    // Если нет в базе, пробуем получить из Telegram API методом getChat
    // (работает только если бот уже взаимодействовал с пользователем)
    console.log('ℹ️ SERVER: User not found in database, trying Telegram API...');
    
    try {
      const response = await axios.post(
        `https://api.telegram.org/bot${ACTUAL_BOT_TOKEN}/getChat`,
        { chat_id: telegramId }
      );
      
      if (response.data.ok) {
        const tgUser = response.data.result;
        console.log('✅ SERVER: User found via Telegram API:', tgUser);
        
        return res.json({
          telegram_id: telegramId,
          first_name: tgUser.first_name || '',
          last_name: tgUser.last_name || '',
          username: tgUser.username || '',
          photo_url: tgUser.photo?.big_file_id || null
        });
      }
    } catch (apiError) {
      console.log('ℹ️ SERVER: Telegram API error (user never started bot):', apiError.response?.data?.description || apiError.message);
    }
    
    res.status(404).json({
      success: false,
      error: 'User not found. User must start the bot first.'
    });

  } catch (error) {
    console.error('❌ SERVER: Error fetching Telegram user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user data'
    });
  }
});

// ========================================
// Tarologist Management API
// ========================================

/**
 * GET /api/admin/tarologist/:id
 * Получить таролога по ID с детальной информацией
 */
app.get('/api/admin/tarologist/:id', isAdmin, (req, res) => {
  try {
    const tarologist = Tarologist.getById(req.params.id);

    if (!tarologist) {
      return res.status(404).json({ success: false, error: 'Tarologist not found' });
    }

    // Получаем баланс
    const balance = Payout.getTarologistBalance(tarologist.id);

    // Получаем статистику
    const statsStmt = db.prepare(`
      SELECT 
        COUNT(*) as consultations,
        SUM(stars_amount) as total_revenue,
        SUM(tarologist_cut) as total_earned
      FROM transactions
      WHERE tarologist_id = ? AND status = 'completed'
    `);
    const stats = statsStmt.get(tarologist.id);

    res.json({
      success: true,
      data: {
        ...tarologist,
        balance,
        stats
      }
    });
  } catch (error) {
    console.error('Get tarologist error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/tarologist
 * Создать таролога (с автозаполнением из Telegram)
 */
app.post('/api/admin/tarologist', isAdmin, async (req, res) => {
  try {
    const { telegram_id, name, description, photo_url } = req.body;

    if (!telegram_id) {
      return res.status(400).json({ success: false, error: 'Telegram ID обязателен' });
    }

    // Проверяем, не существует ли уже
    const existing = db.prepare('SELECT id FROM tarologists WHERE telegram_id = ?').get(telegram_id);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Таролог с таким Telegram ID уже существует' });
    }

    // Если имя не указано — пробуем получить из Telegram
    let finalName = name;
    let finalPhoto = photo_url;

    if (!finalName || !finalPhoto) {
      try {
        const tgUser = await callTelegram('getChat', { chat_id: telegram_id });
        if (tgUser && tgUser.ok) {
          const user = tgUser.result;
          if (!finalName) {
            finalName = user.first_name || user.username || 'Аноним';
          }
          if (!finalPhoto && user.photo) {
            // Получаем фото профиля
            const photos = await callTelegram('getUserProfilePhotos', {
              user_id: telegram_id,
              limit: 1
            });
            if (photos.ok && photos.result.total_count > 0) {
              const fileId = photos.result.photos[0][0].file_id;
              const file = await callTelegram('getFile', { file_id: fileId });
              if (file.ok) {
                finalPhoto = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.result.file_path}`;
              }
            }
          }
        }
      } catch (e) {
        console.log('Не удалось получить данные из Telegram:', e.message);
      }
    }

    // Создаём таролога
    const result = Tarologist.create({
      name: finalName || 'Аноним',
      photo_url: finalPhoto || null,
      description: description || '',
      telegram_id
    });

    const tarologist = Tarologist.getById(result.lastInsertRowid);

    res.json({ success: true, data: tarologist });
  } catch (error) {
    console.error('Create tarologist error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/tarologist/:id
 * Обновить таролога
 */
app.put('/api/admin/tarologist/:id', isAdmin, (req, res) => {
  try {
    const { name, description, photo_url } = req.body;
    const tarologistId = req.params.id;

    const tarologist = Tarologist.getById(tarologistId);
    if (!tarologist) {
      return res.status(404).json({ success: false, error: 'Таролог не найден' });
    }

    // Обновляем
    const stmt = db.prepare(`
      UPDATE tarologists
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          photo_url = COALESCE(?, photo_url)
      WHERE id = ?
    `);

    stmt.run(name, description, photo_url, tarologistId);

    const updated = Tarologist.getById(tarologistId);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update tarologist error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/transactions
 * Получить транзакции с фильтрацией
 */
app.get('/api/admin/transactions', isAdmin, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    let query;
    if (days === 'all') {
      query = db.prepare(`
        SELECT
          t.*,
          tar.name as tarologist_name
        FROM transactions t
        JOIN tarologists tar ON t.tarologist_id = tar.id
        WHERE t.status = 'completed'
        ORDER BY t.created_at DESC
        LIMIT 100
      `);
    } else {
      query = db.prepare(`
        SELECT
          t.*,
          tar.name as tarologist_name
        FROM transactions t
        JOIN tarologists tar ON t.tarologist_id = tar.id
        WHERE t.status = 'completed'
          AND t.created_at >= datetime('now', '-' || ? || ' days')
        ORDER BY t.created_at DESC
        LIMIT 100
      `);
    }

    const transactions = days === 'all'
      ? query.all()
      : query.all(days);

    res.json(transactions);
  } catch (error) {
    console.error('Ошибка получения транзакций:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/cancel-payment
 * Отмена оплаты (Refund) через админку
 */
app.post('/api/admin/cancel-payment', isAdmin, async (req, res) => {
  try {
    const { transactionId, reason } = req.body;

    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'Transaction ID required' });
    }

    const transaction = Transaction.getById(transactionId);
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    if (transaction.status !== 'completed') {
      return res.status(400).json({ 
        success: false, 
        error: `Cannot refund transaction with status: ${transaction.status}` 
      });
    }

    // Возврат средств через Telegram API
    const refundResult = await axios.post(
      `https://api.telegram.org/bot${ACTUAL_BOT_TOKEN}/refundStarPayment`,
      {
        user_id: transaction.user_telegram_id,
        telegram_payment_charge_id: transaction.telegram_payment_id,
        comment: reason || 'Refund by admin'
      }
    );

    if (refundResult.data.ok) {
      // Обновляем статус транзакции
      Transaction.updateStatus(transactionId, 'refunded');

      // Завершаем сессию если была
      const session = ChatSession.getActiveByUser(transaction.user_id);
      if (session) {
        ChatSession.markCompleted(session.id);
      }

      // Уведомляем пользователя
      if (transaction.user_telegram_id) {
        sendTelegramMessage(
          transaction.user_telegram_id,
          `💰 Возврат средств\n\nОплата за консультацию была отменена.\nСумма: ${transaction.stars_amount} ⭐\nПричина: ${reason || 'Без указания причины'}\n\nСредства будут зачислены в течение нескольких минут.`
        );
      }

      console.log(`💰 Возврат выполнен. Транзакция: ${transactionId}, Сумма: ${transaction.stars_amount} ⭐`);

      res.json({ 
        success: true, 
        message: 'Refund processed successfully',
        refundId: refundResult.data.result?.refund_id 
      });
    } else {
      console.error('❌ Ошибка возврата:', refundResult.data);
      res.status(400).json({ 
        success: false, 
        error: refundResult.data.description || 'Refund failed' 
      });
    }
  } catch (error) {
    console.error('Ошибка отмены оплаты:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    });
  }
});

/**
 * GET /api/admin/transaction/:id
 * Получить информацию о транзакции
 */
app.get('/api/admin/transaction/:id', isAdmin, (req, res) => {
  try {
    const transaction = Transaction.getById(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    // Получаем сообщения сессии если есть
    const session = db.prepare(`
      SELECT * FROM chat_sessions 
      WHERE user_id = ? AND tarologist_id = ?
      ORDER BY start_time DESC LIMIT 1
    `).get(transaction.user_id, transaction.tarologist_id);

    const messages = session 
      ? Message.getBySession(session.id) 
      : [];

    res.json({
      success: true,
      data: {
        ...transaction,
        session,
        messages_count: messages.length
      }
    });
  } catch (error) {
    console.error('Ошибка получения транзакции:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/refundable-transactions
 * Получить транзакции, доступные для возврата (завершенные)
 */
app.get('/api/admin/refundable-transactions', isAdmin, (req, res) => {
  try {
    const transactions = db.prepare(`
      SELECT t.*, tar.name as tarologist_name
      FROM transactions t
      LEFT JOIN tarologists tar ON t.tarologist_id = tar.id
      WHERE t.status = 'completed'
      ORDER BY t.created_at DESC
      LIMIT 100
    `).all();
    
    res.json(transactions);
  } catch (error) {
    console.error('Ошибка получения транзакций для возврата:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/payouts
 * Получить все выплаты
 */
app.get('/api/admin/payouts', isAdmin, (req, res) => {
  try {
    const payouts = Payout.getAll();
    res.json(payouts);
  } catch (error) {
    console.error('Ошибка получения выплат:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/payout/:id
 * Получить выплату по ID
 */
app.get('/api/admin/payout/:id', isAdmin, (req, res) => {
  try {
    const payout = Payout.getById(req.params.id);

    if (!payout) {
      return res.status(404).json({ success: false, error: 'Payout not found' });
    }

    res.json({ success: true, data: payout });
  } catch (error) {
    console.error('Get payout error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/payout
 * Создать выплату (pending)
 */
app.post('/api/admin/payout', isAdmin, (req, res) => {
  try {
    const { tarologist_id, amount, notes } = req.body;

    if (!tarologist_id || !amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid data' });
    }

    // Проверяем баланс таролога
    const balance = Payout.getTarologistBalance(tarologist_id);
    if (balance < amount) {
      return res.status(400).json({
        success: false,
        error: `Недостаточно средств. Баланс: ${balance}, запрошено: ${amount}`
      });
    }

    // Создаём выплату со статусом pending
    const payout = Payout.create({
      tarologistId: tarologist_id,
      amount: amount,
      status: 'pending',
      notes: notes || ''
    });

    res.json({ success: true, data: payout });
  } catch (error) {
    console.error('Create payout error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/payout/:id/complete
 * Отметить выплату как выполненную
 */
app.put('/api/admin/payout/:id/complete', isAdmin, (req, res) => {
  try {
    const payoutId = req.params.id;
    const { telegram_payment_id } = req.body;

    const payout = Payout.getById(payoutId);
    if (!payout) {
      return res.status(404).json({ success: false, error: 'Payout not found' });
    }

    if (payout.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Payout already completed' });
    }

    // Обновляем выплату
    const stmt = db.prepare(`
      UPDATE payouts
      SET status = 'completed',
          completed_at = CURRENT_TIMESTAMP,
          telegram_payment_id = ?
      WHERE id = ?
    `);
    stmt.run(telegram_payment_id || null, payoutId);

    const updated = Payout.getById(payoutId);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Complete payout error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/payout/:id/cancel
 * Отменить выплату
 */
app.put('/api/admin/payout/:id/cancel', isAdmin, (req, res) => {
  try {
    const payoutId = req.params.id;
    const { reason } = req.body;

    const payout = Payout.getById(payoutId);
    if (!payout) {
      return res.status(404).json({ success: false, error: 'Payout not found' });
    }

    if (payout.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Cannot cancel completed payout' });
    }

    // Обновляем выплату
    const stmt = db.prepare(`
      UPDATE payouts
      SET status = 'cancelled',
          notes = ?
      WHERE id = ?
    `);
    stmt.run(reason || payout.notes, payoutId);

    const updated = Payout.getById(payoutId);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Cancel payout error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ========================================
// Admin API — Управление тарологами
// ========================================

/**
 * GET /api/admin/tarologist/:id
 * Получить таролога по ID
 */
app.get('/api/admin/tarologist/:id', isAdmin, (req, res) => {
  try {
    const tarologist = Tarologist.getById(req.params.id);
    
    if (!tarologist) {
      return res.status(404).json({ success: false, error: 'Таролог не найден' });
    }
    
    res.json({ success: true, data: tarologist });
  } catch (error) {
    console.error('Ошибка получения таролога:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/tarologist
 * Создать нового таролога
 */
app.post('/api/admin/tarologist', isAdmin, async (req, res) => {
  try {
    const { telegram_id, name, description, photo_url } = req.body;
    
    if (!telegram_id) {
      return res.status(400).json({ success: false, error: 'Telegram ID обязателен' });
    }
    
    // Проверяем, не существует ли уже
    const existing = db.prepare('SELECT id FROM tarologists WHERE telegram_id = ?').get(telegram_id);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Таролог с таким Telegram ID уже существует' });
    }
    
    // Если имя не указано — пробуем получить из Telegram
    let finalName = name;
    let finalPhoto = photo_url;
    
    if (!finalName || !finalPhoto) {
      try {
        const tgUser = await callTelegram('getChat', { chat_id: telegram_id });
        if (tgUser && tgUser.ok) {
          const user = tgUser.result;
          if (!finalName) {
            finalName = user.first_name || user.username || 'Аноним';
          }
          if (!finalPhoto && user.photo) {
            // Получаем фото профиля
            const photos = await callTelegram('getUserProfilePhotos', { 
              user_id: telegram_id, 
              limit: 1 
            });
            if (photos.ok && photos.result.total_count > 0) {
              const fileId = photos.result.photos[0][0].file_id;
              const file = await callTelegram('getFile', { file_id: fileId });
              if (file.ok) {
                finalPhoto = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.result.file_path}`;
              }
            }
          }
        }
      } catch (e) {
        console.log('Не удалось получить данные из Telegram:', e.message);
      }
    }
    
    // Создаём таролога
    const result = Tarologist.create({
      name: finalName || 'Аноним',
      photo_url: finalPhoto || null,
      description: description || '',
      telegram_id
    });
    
    const tarologist = Tarologist.getById(result.lastInsertRowid);
    
    res.json({ success: true, data: tarologist });
  } catch (error) {
    console.error('Ошибка создания таролога:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/tarologist/:id
 * Обновить таролога
 */
app.put('/api/admin/tarologist/:id', isAdmin, (req, res) => {
  try {
    const { name, description, photo_url } = req.body;
    const tarologistId = req.params.id;
    
    const tarologist = Tarologist.getById(tarologistId);
    if (!tarologist) {
      return res.status(404).json({ success: false, error: 'Таролог не найден' });
    }
    
    // Обновляем
    const stmt = db.prepare(`
      UPDATE tarologists
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          photo_url = COALESCE(?, photo_url)
      WHERE id = ?
    `);
    
    stmt.run(name, description, photo_url, tarologistId);
    
    const updated = Tarologist.getById(tarologistId);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Ошибка обновления таролога:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/tarologist/:id/online
 * Обновить статус онлайн таролога
 */
app.put('/api/admin/tarologist/:id/online', isAdmin, (req, res) => {
  try {
    const { is_online } = req.body;
    const tarologistId = req.params.id;

    const tarologist = Tarologist.getById(tarologistId);
    if (!tarologist) {
      return res.status(404).json({ success: false, error: 'Таролог не найден' });
    }

    Tarologist.setOnlineStatus(tarologistId, is_online);

    const updated = Tarologist.getById(tarologistId);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Ошибка обновления статуса онлайн:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/tarologist/:id/disable
 * Отключить таролога (не удалять, а скрыть из списка)
 */
app.put('/api/admin/tarologist/:id/disable', isAdmin, (req, res) => {
  try {
    const tarologistId = req.params.id;

    const tarologist = Tarologist.getById(tarologistId);
    if (!tarologist) {
      return res.status(404).json({ success: false, error: 'Таролог не найден' });
    }

    // Отключаем таролога (не удаляем!)
    Tarologist.disable(tarologistId);

    console.log(`🔕 Таролог ${tarologistId} (${tarologist.name}) отключен`);
    res.json({ success: true, message: 'Таролог отключен' });
  } catch (error) {
    console.error('Ошибка отключения таролога:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/tarologist/:id
 * Удалить таролога
 */
app.delete('/api/admin/tarologist/:id', isAdmin, (req, res) => {
  try {
    const tarologistId = req.params.id;
    
    const tarologist = Tarologist.getById(tarologistId);
    if (!tarologist) {
      return res.status(404).json({ success: false, error: 'Таролог не найден' });
    }
    
    // Сначала удаляем связанные записи (каскадное удаление)
    console.log(`🗑️ Удаление таролога ${tarologistId}...`);
    
    // Отключаем проверку FOREIGN KEY временно
    db.prepare('PRAGMA foreign_keys = OFF').run();
    
    try {
      // Удаляем сообщения чата
      const deleteMessages = db.prepare('DELETE FROM messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE tarologist_id = ?)');
      const msgResult = deleteMessages.run(tarologistId);
      console.log(`✅ Связанные сообщения удалены: ${msgResult.changes} шт`);
      
      // Удаляем сессии чата
      const deleteSessions = db.prepare('DELETE FROM chat_sessions WHERE tarologist_id = ?');
      const sessionResult = deleteSessions.run(tarologistId);
      console.log(`✅ Сессии чата удалены: ${sessionResult.changes} шт`);
      
      // Удаляем транзакции
      const deleteTransactions = db.prepare('DELETE FROM transactions WHERE tarologist_id = ?');
      const transResult = deleteTransactions.run(tarologistId);
      console.log(`✅ Транзакции удалены: ${transResult.changes} шт`);
      
      // Удаляем выплаты
      const deletePayouts = db.prepare('DELETE FROM payouts WHERE tarologist_id = ?');
      const payoutResult = deletePayouts.run(tarologistId);
      console.log(`✅ Выплаты удалены: ${payoutResult.changes} шт`);
      
      // Удаляем события
      if (tarologist.telegram_id) {
        const deleteEvents = db.prepare('DELETE FROM events WHERE user_id IN (SELECT id FROM users WHERE telegram_id = ?)');
        const eventResult = deleteEvents.run(tarologist.telegram_id);
        console.log(`✅ События удалены: ${eventResult.changes} шт`);
      }
      
      // Удаляем самого таролога
      const stmt = db.prepare('DELETE FROM tarologists WHERE id = ?');
      const result = stmt.run(tarologistId);
      console.log(`✅ Таролог удален: ${result.changes} записей`);
      
    } finally {
      // Включаем проверку FOREIGN KEY обратно
      db.prepare('PRAGMA foreign_keys = ON').run();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления таролога:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ========================================
// Bot Webhook (опционально)
// ========================================

/**
 * POST /api/bot/webhook
 * Вебхук для бота админки и обработки сообщений от тарологов
 */
app.post('/api/bot/webhook', async (req, res) => {
  const update = req.body;
  
  // Обработка callback_query (кнопки)
  if (update.callback_query) {
    console.log('🔍 WEBHOOK: Received callback_query:', update.callback_query.data);
    await adminBot.handleWebhookUpdate(update);
    return res.json({ ok: true });
  }
  
  // Обработка сообщений от тарологов
  if (update.message) {
    const chatId = update.message.chat.id;
    const messageId = update.message.message_id;
    
    // Проверяем, является ли отправитель тарологом
    const tarologist = db.prepare('SELECT id FROM tarologists WHERE telegram_id = ?').get(chatId.toString());
    
    if (tarologist) {
      // Получаем активную сессию таролога
      const session = db.prepare(`
        SELECT cs.* FROM chat_sessions cs
        WHERE cs.tarologist_id = ? AND cs.active = 1 AND cs.completed = 0
        ORDER BY cs.start_time DESC
        LIMIT 1
      `).get(tarologist.id);
      
      if (session) {
        let messageType = 'text';
        let text = update.message.text || '';
        let fileId = null;
        let fileUrl = null;
        let duration = null;
        
        // Определяем тип сообщения и извлекаем данные
        if (update.message.photo) {
          messageType = 'photo';
          const photo = update.message.photo[update.message.photo.length - 1];
          fileId = photo.file_id;
          const file = await callTelegram('getFile', { file_id: fileId });
          if (file.ok) {
            fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.result.file_path}`;
          }
          text = update.message.caption || '';
        } else if (update.message.voice) {
          messageType = 'voice';
          fileId = update.message.voice.file_id;
          duration = update.message.voice.duration;
          const file = await callTelegram('getFile', { file_id: fileId });
          if (file.ok) {
            fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.result.file_path}`;
          }
        } else if (update.message.video) {
          messageType = 'video';
          fileId = update.message.video.file_id;
          duration = update.message.video.duration;
          const file = await callTelegram('getFile', { file_id: fileId });
          if (file.ok) {
            fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.result.file_path}`;
          }
          text = update.message.caption || '';
        } else if (update.message.audio) {
          messageType = 'audio';
          fileId = update.message.audio.file_id;
          duration = update.message.audio.duration;
          const file = await callTelegram('getFile', { file_id: fileId });
          if (file.ok) {
            fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.result.file_path}`;
          }
        } else if (update.message.document) {
          messageType = 'document';
          fileId = update.message.document.file_id;
          const file = await callTelegram('getFile', { file_id: fileId });
          if (file.ok) {
            fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.result.file_path}`;
          }
        }
        
        // Сохраняем сообщение в БД
        const message = Message.createWithMedia({
          sessionId: session.id,
          senderId: tarologist.id,
          senderType: 'tarologist',
          messageType,
          text,
          fileId,
          fileUrl,
          duration,
          telegramMessageId: messageId
        });
        
        // Отправляем сообщение клиенту через WebSocket
        io.to(`session_${session.id}`).emit('new-message', {
          id: message.id,
          text: message.text,
          message_type: message.message_type,
          file_url: message.file_url,
          duration: message.duration,
          senderId: message.sender_id,
          senderType: 'tarologist',
          timestamp: message.timestamp
        });
      }
    }
    
    // Обработка команд бота
    if (update.message.text) {
      const text = update.message.text;
      if (text.startsWith('/')) {
        const [command, ...args] = text.split(' ');
        await handleCommand(chatId, command.toLowerCase(), args);
      }
    }
  }
  
  // Обработка callback query
  if (update.callback_query) {
    // Пока ничего не делаем
  }
  
  res.json({ ok: true });
});

// ========================================
// API для отправки расклада тарологу
// ========================================

/**
 * POST /api/spread/send
 * Отправить расклад тарологу
 */
app.post('/api/spread/send', async (req, res) => {
  try {
    const { initData, tarologistId, spreadType, cards } = req.body;
    
    // Валидация Telegram данных
    if (!validateTelegramData(initData)) {
      return res.status(401).json({ success: false, error: 'Invalid Telegram data' });
    }
    
    const params = new URLSearchParams(initData);
    const userJson = params.get('user');
    
    if (!userJson) {
      return res.status(400).json({ success: false, error: 'No user data' });
    }
    
    const userData = JSON.parse(userJson);
    const user = User.findOrCreate(userData.id.toString(), {
      username: userData.username,
      first_name: userData.first_name,
      last_name: userData.last_name
    });
    
    // Создаём расклад
    const spread = Spread.create({
      userId: user.id,
      tarologistId: tarologistId || null,
      spreadType,
      cards
    });
    
    // Если указан таролог — отправляем уведомление
    if (tarologistId) {
      const tarologist = Tarologist.getById(tarologistId);
      if (tarologist?.telegram_id) {
        const cardsList = cards.map(c => c.name_ru).join(', ');
        await sendTelegramMessage(
          tarologist.telegram_id,
          `🔮 Новый расклад от клиента!\n\nТип: ${spreadType === 'daily' ? 'Ежедневный' : 'На ситуацию'}\nКарты: ${cardsList}\n\nНачните чат в приложении.`
        );
      }
    }
    
    res.json({ success: true, data: spread });
  } catch (error) {
    console.error('Ошибка отправки расклада:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/spread/my
 * Получить мои расклады
 */
app.get('/api/spread/my', (req, res) => {
  try {
    const initData = req.headers['x-telegram-init-data'];
    
    if (!initData || !validateTelegramData(initData)) {
      return res.status(401).json({ success: false, error: 'Invalid Telegram data' });
    }
    
    const params = new URLSearchParams(initData);
    const userJson = params.get('user');
    
    if (!userJson) {
      return res.status(400).json({ success: false, error: 'No user data' });
    }
    
    const userData = JSON.parse(userJson);
    const user = User.getByTelegramId(userData.id.toString());
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const spreads = Spread.getByUser(user.id);
    res.json({ success: true, data: spreads });
  } catch (error) {
    console.error('Ошибка получения раскладов:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ========================================
// WebSocket для чата
// ========================================

io.on('connection', (socket) => {
  console.log('Клиент подключился:', socket.id);
  
  // Подключение к сессии чата
  socket.on('join-session', (data) => {
    const { sessionId, userId, userType } = data; // userType: 'client' | 'tarologist'
    
    socket.join(`session_${sessionId}`);
    socket.data = { sessionId, userId, userType };
    
    console.log(`Пользователь ${userId} (${userType}) подключился к сессии ${sessionId}`);
    
    // Отправляем историю сообщений
    const messages = Message.getBySession(sessionId);
    socket.emit('messages-history', messages);
  });
  
  // Отправка сообщения
  socket.on('send-message', (data) => {
    const { sessionId, text, senderId, senderType } = data;
    
    // Проверяем, активна ли сессия
    const session = ChatSession.getById(sessionId);
    if (!session || !session.active) {
      socket.emit('error', { message: 'Сессия не активна' });
      return;
    }
    
    // Проверяем, не истекло ли время
    if (ChatSession.isExpired(sessionId)) {
      ChatSession.markCompleted(sessionId);
      socket.emit('session-expired');
      return;
    }
    
    // Сохраняем сообщение
    const message = Message.create({
      sessionId,
      senderId,
      senderType,
      text
    });
    
    // Рассылаем сообщение всем в сессии
    io.to(`session_${sessionId}`).emit('new-message', {
      id: message.id,
      text: message.text,
      senderId: message.sender_id,
      senderType: message.sender_type,
      timestamp: message.timestamp
    });
  });
  
  // Запрос оставшегося времени
  socket.on('get-time-left', (sessionId) => {
    const session = ChatSession.getById(sessionId);
    if (!session) {
      socket.emit('time-left', { error: 'Session not found' });
      return;
    }
    
    const startTime = new Date(session.start_time).getTime();
    const elapsed = (Date.now() - startTime) / 1000;
    const timeLeft = Math.max(0, session.duration_seconds - elapsed);
    
    socket.emit('time-left', { timeLeft, expired: timeLeft <= 0 });
  });
  
  socket.on('disconnect', () => {
    console.log('Клиент отключился:', socket.id);
  });
});

// ========================================
// Запуск сервера
// ========================================

// Инициализация тестовых данных
initializeTestData();

// Настройка вебхука Telegram при старте
async function setupWebhook() {
  // Webhook отключен - используем polling для бота админки
  console.log('Вебхук отключен - используется polling для бота');
  return;
  
  /*
  if (!WEBHOOK_URL || !BOT_TOKEN) {
    console.log('Вебхук не настроен (нет WEBHOOK_URL или BOT_TOKEN)');
    return;
  }
  
  try {
    await axios.post(`https://api.telegram.org/bot${ACTUAL_BOT_TOKEN}/setWebhook`, {
      url: WEBHOOK_URL
    });
    console.log('Вебхук установлен:', WEBHOOK_URL);
  } catch (error) {
    console.error('Ошибка установки вебхука:', error.message);
  }
  */
}

// ========================================
// Автоматическая проверка и возврат средств
// ========================================

/**
 * Автоматический возврат средств за "пустые" консультации
 * Проверяет оплаченные транзакции без сообщений в чате
 */
async function processAutoRefunds() {
  try {
    console.log('🔄 Checking for auto-refunds...');
    
    // Получаем транзакции, готовые для проверки (оплачены 10+ минут назад)
    const pendingTransactions = Transaction.getPendingForAutoRefund(10);
    
    if (!pendingTransactions || pendingTransactions.length === 0) {
      console.log('✅ No transactions need auto-refund check');
      return;
    }
    
    console.log(`🔍 Found ${pendingTransactions.length} transactions to check`);
    
    for (const transaction of pendingTransactions) {
      try {
        // Проверяем, есть ли сессия чата
        if (!transaction.session_id) {
          console.log(`⚠️ Transaction ${transaction.id}: No chat session found`);
          
          // Нет сессии - автовозврат
          await autoRefundTransaction(transaction, 'NO_CHAT_SESSION');
          continue;
        }
        
        // Проверяем, есть ли сообщения в сессии
        const messageCount = ChatSession.getMessageCount(transaction.session_id);
        
        if (messageCount === 0) {
          console.log(`⚠️ Transaction ${transaction.id}: No messages in chat session ${transaction.session_id}`);
          
          // Нет сообщений - автовозврат
          await autoRefundTransaction(transaction, 'NO_MESSAGES');
        } else {
          console.log(`✅ Transaction ${transaction.id}: Has ${messageCount} messages, no refund needed`);
          
          // Отмечаем как проверенную (без возврата)
          Transaction.updateStatus(transaction.id, 'completed', transaction.telegram_payment_id);
        }
      } catch (error) {
        console.error(`❌ Error processing auto-refund for transaction ${transaction.id}:`, error);
      }
    }
  } catch (error) {
    console.error('❌ Error in auto-refund process:', error);
  }
}

/**
 * Выполнить автоматический возврат средств
 */
async function autoRefundTransaction(transaction, reason) {
  try {
    console.log(`💰 Processing auto-refund for transaction ${transaction.id}, reason: ${reason}`);
    
    if (!transaction.telegram_payment_id) {
      console.error(`❌ Transaction ${transaction.id}: No telegram_payment_id for refund`);
      return;
    }
    
    // Получаем Telegram ID пользователя
    const user = User.getById(transaction.user_id);
    if (!user || !user.telegram_id) {
      console.error(`❌ Transaction ${transaction.id}: Cannot find user Telegram ID`);
      return;
    }
    
    // Выполняем возврат через Telegram API
    const refundResult = await axios.post(
      `https://api.telegram.org/bot${ACTUAL_BOT_TOKEN}/refundStarPayment`,
      {
        user_id: parseInt(user.telegram_id),
        telegram_payment_charge_id: transaction.telegram_payment_id
      }
    );
    
    if (refundResult.data.ok) {
      console.log(`✅ Auto-refund successful for transaction ${transaction.id}`);
      
      // Обновляем статус транзакции
      Transaction.markAutoRefunded(transaction.id, reason);
      
      // Отправляем уведомление пользователю
      await sendAutoRefundNotification(user.telegram_id, transaction, reason);
    } else {
      console.error(`❌ Auto-refund failed for transaction ${transaction.id}:`, refundResult.data);
    }
  } catch (error) {
    console.error(`❌ Error in autoRefundTransaction ${transaction.id}:`, error.message);
  }
}

/**
 * Отправить уведомление пользователю об автовозврате
 */
async function sendAutoRefundNotification(telegramId, transaction, reason) {
  try {
    let message = '💫 *Возврат средств*\n\n';
    message += `Вам возвращено *${transaction.stars_amount}* ⭐\n\n`;
    
    if (reason === 'NO_CHAT_SESSION') {
      message += 'Причина: Техническая ошибка - чат с тарологом не был создан. Мы приносим извинения за неудобства.';
    } else if (reason === 'NO_MESSAGES') {
      message += 'Причина: Консультация не состоялась - таролог не ответил на сообщения. Мы приносим извинения за неудобства.';
    } else if (reason === 'TAROLOGIST_OFFLINE') {
      message += 'Причина: Таролог стал недоступен во время консультации.';
    } else {
      message += 'Причина: Консультация не состоялась по техническим причинам.';
    }
    
    message += '\n\nСредства вернутся на ваш баланс в течение нескольких минут.';
    
    await axios.post(
      `https://api.telegram.org/bot${ACTUAL_BOT_TOKEN}/sendMessage`,
      {
        chat_id: telegramId,
        text: message,
        parse_mode: 'Markdown'
      }
    );
    
    console.log(`✅ Auto-refund notification sent to user ${telegramId}`);
  } catch (error) {
    console.error(`❌ Error sending auto-refund notification:`, error.message);
  }
}

// Запускаем проверку автовозвратов каждые 5 минут
setInterval(processAutoRefunds, 5 * 60 * 1000);

httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  🎴 Tarot Mini App Server                 ║
║  Порт: ${PORT}                              ║
║  WebSocket: готов                         ║
╚════════════════════════════════════════════╝
  `);
  
  setupWebhook();
  
  // Бот использует webhook (не polling)
  console.log('🤖 Admin bot webhook mode');
  console.log('🔄 Auto-refund check enabled (every 5 minutes)');
});

export default app;
