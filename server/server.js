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
  Payout,
  calculatePrice,
  initializeTestData
} from './db.js';
import { handleWebhookUpdate } from './admin-bot.js';

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
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: telegramId,
      text
    });
  } catch (error) {
    console.error('Ошибка отправки сообщения в Telegram:', error.message);
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
    
    // Создаём инвойс через Telegram API
    const invoiceData = {
      chat_id: user.telegram_id,
      title: 'Консультация таролога',
      description: `Консультация с тарологом ${tarologist.name} (25 минут)`,
      payload: `tarot_session_${transaction.id}`,
      provider_token: 'STARS',
      currency: 'XTR',
      prices: [
        { label: 'Консультация', amount: starsAmount }
      ],
      start_parameter: `tarot_${transaction.id}`,
      need_name: false,
      need_phone_number: false,
      need_email: false,
      need_shipping_address: false
    };
    
    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendInvoice`,
      invoiceData
    );
    
    // Обновляем статус транзакции
    const telegramPaymentId = response.data.result.message_id?.toString();
    Transaction.updateStatus(transaction.id, 'pending', telegramPaymentId);
    
    res.json({
      success: true,
      data: {
        transactionId: transaction.id,
        invoiceLink: response.data.result.invoice_link,
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
    
    // Проверяем, что это успешная оплата
    if (update.pre_checkout_query) {
      // Подтверждаем pre-checkout query
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
        pre_checkout_query_id: update.pre_checkout_query.id,
        ok: true
      });
      return res.json({ ok: true });
    }
    
    if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;
      const transactionId = parseInt(payment.invoice_payload.replace('tarot_session_', ''));
      
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
      
      console.log(`Платёж успешен. Сессия ${chatSession.id} создана.`);
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
// Admin API Routes
// ========================================

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
    // Общий доход (все завершённые транзакции)
    const revenueStmt = db.prepare(`
      SELECT 
        COALESCE(SUM(stars_amount), 0) as total,
        COALESCE(SUM(developer_cut), 0) as dev_cut,
        COALESCE(SUM(tarologist_cut), 0) as taro_cut
      FROM transactions
      WHERE status = 'completed'
    `);
    const revenue = revenueStmt.get();
    
    // Количество тарологов
    const tarologistsStmt = db.prepare('SELECT COUNT(*) as count FROM tarologists');
    const totalTarologists = tarologistsStmt.get().count;
    
    // Количество консультаций
    const sessionsStmt = db.prepare('SELECT COUNT(*) as count FROM chat_sessions WHERE completed = 1');
    const totalSessions = sessionsStmt.get().count;
    
    // Сумма к выплате (баланс всех тарологов)
    const payoutStmt = db.prepare(`
      SELECT 
        COALESCE(SUM(t.tarologist_cut), 0) - COALESCE(SUM(p.amount), 0) as total_payout
      FROM tarologists t
      LEFT JOIN transactions tr ON t.id = tr.tarologist_id AND tr.status = 'completed'
      LEFT JOIN payouts p ON t.id = p.tarologist_id AND p.status = 'completed'
    `);
    const totalPayout = payoutStmt.get().total_payout || 0;
    
    res.json({
      totalRevenue: revenue.total,
      developerCut: revenue.dev_cut,
      tarologistCut: revenue.tar_cut,
      totalTarologists,
      totalSessions,
      totalPayout
    });
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
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
 * POST /api/admin/payouts
 * Создать выплату (отметить как выполненную)
 */
app.post('/api/admin/payouts', isAdmin, (req, res) => {
  try {
    const { tarologist_id, amount } = req.body;
    
    if (!tarologist_id || !amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid data' });
    }
    
    // Проверяем баланс таролога
    const balance = Payout.getTarologistBalance(tarologist_id);
    if (balance < amount) {
      return res.status(400).json({ 
        success: false, 
        error: `Недостаточно средств. Баланс: ${balance}` 
      });
    }
    
    // Создаём выплату
    const payout = Payout.create({
      tarologistId: tarologist_id,
      amount: amount,
      status: 'completed',
      notes: `Выплата от ${req.adminUser.first_name || 'Admin'}`
    });
    
    res.json({ success: true, data: payout });
  } catch (error) {
    console.error('Ошибка создания выплаты:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ========================================
// Bot Webhook (опционально)
// ========================================

/**
 * POST /api/bot/webhook
 * Вебхук для бота админки
 */
app.post('/api/bot/webhook', (req, res) => {
  const update = req.body;
  const result = handleWebhookUpdate(update);
  res.json(result);
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
  if (!WEBHOOK_URL || !BOT_TOKEN) {
    console.log('Вебхук не настроен (нет WEBHOOK_URL или BOT_TOKEN)');
    return;
  }
  
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      url: WEBHOOK_URL
    });
    console.log('Вебхук установлен:', WEBHOOK_URL);
  } catch (error) {
    console.error('Ошибка установки вебхука:', error.message);
  }
}

httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  🎴 Tarot Mini App Server                 ║
║  Порт: ${PORT}                              ║
║  WebSocket: готов                         ║
╚════════════════════════════════════════════╝
  `);
  
  setupWebhook();
});

export default app;
