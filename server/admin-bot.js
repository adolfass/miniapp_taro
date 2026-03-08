/**
 * Admin Bot for Tarot Mini App
 * Бот для доступа к админ-панели
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { Tarologist, Payout, Transaction } from './db.js';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://your-domain.com';

console.log('🔍 BOT: Token loaded:', BOT_TOKEN ? 'Yes (length: ' + BOT_TOKEN.length + ')' : 'No');

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не установлен в .env');
  process.exit(1);
}

// ========================================
// Telegram API helper
// ========================================
async function callTelegram(method, data = {}) {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
      data
    );
    return response.data;
  } catch (error) {
    console.error(`Telegram API error (${method}):`, error.response?.data || error.message);
    return null;
  }
}

// ========================================
// Обработчик команд
// ========================================
async function handleCommand(chatId, command, args) {
  switch (command) {
    case '/start':
      await handleStart(chatId, args);
      break;
    
    case '/admin':
      await handleAdmin(chatId);
      break;
    
    case '/help':
      await handleHelp(chatId);
      break;
    
    default:
      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: 'Неизвестная команда. Используйте /help для справки.'
      });
  }
}

async function handleStart(chatId, args = []) {
  // Проверяем, есть ли параметр оплаты (tarot_{id})
  const startParam = args[0];
  if (startParam && startParam.startsWith('tarot_')) {
    const transactionId = startParam.replace('tarot_', '');
    
    // Отправляем инвойс для оплаты
    await sendPaymentInvoice(chatId, transactionId);
    return;
  }
  
  const welcomeText = `🔮 **Золотое Таро**

Добро пожаловать в админ-панель Tarot Mini App!

**Доступные команды:**
/admin — Открыть админ-панель
/help — Справка

**Статус сервера:** ✅ Работает`;

  // Кнопки для открытия админки и регистрации тарологов
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{
          text: '🔐 Открыть админ-панель',
          web_app: { url: `${WEB_APP_URL}/admin.html?v=${Date.now()}` }
        }],
        [{
          text: '💰 Для тарологов',
          callback_data: 'tarologist_info'
        }]
      ]
    },
    parse_mode: 'Markdown'
  };

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: welcomeText,
    ...keyboard
  });
}

async function handleAdmin(chatId) {
  // Проверяем, что это админ
  if (ADMIN_TELEGRAM_ID && chatId.toString() !== ADMIN_TELEGRAM_ID) {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '❌ Доступ запрещён. Эта команда доступна только администратору.'
    });
    return;
  }

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: '🔐 Открываю админ-панель...',
    reply_markup: {
      inline_keyboard: [[
        {
          text: '📊 Админ-панель',
          web_app: { url: `${WEB_APP_URL}/admin.html?v=${Date.now()}` }
        }
      ]]
    }
  });
}

async function handleHelp(chatId) {
  const helpText = `📖 **Справка по командам**

/start — Запустить бота
/admin — Открыть админ-панель
/help — Эта справка

**Админ-панель позволяет:**
• Просматривать статистику по доходам
• Видеть список тарологов с балансом
• Просматривать все транзакции
• Отмечать выплаты тарологам

**Важно:** Доступ к админ-панели есть только у владельца бота.`;

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: helpText,
    parse_mode: 'Markdown'
  });
}

// Отправка инвойса для оплаты
async function sendPaymentInvoice(chatId, transactionId) {
  try {
    // Получаем данные транзакции из БД
    const transaction = Transaction.getById(transactionId);

    if (!transaction) {
      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: '❌ Ошибка: транзакция не найдена'
      });
      return;
    }

    if (transaction.status !== 'pending') {
      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: 'ℹ️ Эта консультация уже оплачена или отменена'
      });
      return;
    }

    // Получаем данные таролога
    const tarologist = Tarologist.getById(transaction.tarologist_id);
    
    const title = 'Консультация таролога';
    const description = `Консультация с тарологом ${tarologist?.name || 'Специалист'} (25 минут)`;
    const payload = `tarot_session_${transactionId}`;
    const providerToken = ''; // Для Stars оставляем пустым
    const currency = 'XTR';
    const prices = [{ label: 'Консультация', amount: transaction.stars_amount }];
    
    // Отправляем инвойс
    await callTelegram('sendInvoice', {
      chat_id: chatId,
      title,
      description,
      payload,
      provider_token: providerToken,
      currency,
      prices,
      start_parameter: `tarot_${transactionId}`
    });
    
    console.log(`✅ Инвойс отправлен для транзакции ${transactionId}`);
    
  } catch (error) {
    console.error('Ошибка отправки инвойса:', error);
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '❌ Ошибка при создании инвойса. Попробуйте позже.'
    });
  }
}

// ========================================
// Long Polling
// ========================================
let lastUpdateId = 0;

async function getUpdates() {
  const data = {
    offset: lastUpdateId + 1,
    timeout: 30
  };

  console.log('🔍 BOT: Requesting updates from Telegram...');
  const result = await callTelegram('getUpdates', data);
  
  console.log('🔍 BOT: Got result:', result ? 'ok=' + result.ok + ', count=' + (result.result?.length || 0) : 'null');
  
  if (result && result.ok && Array.isArray(result.result)) {
    console.log('🔍 BOT: Processing', result.result.length, 'updates');
    for (const update of result.result) {
      lastUpdateId = update.update_id;
      
      // Обрабатываем сообщение
      if (update.message) {
        const chatId = update.message.chat.id;
        const text = update.message.text || '';
        
        // Если это команда
        if (text.startsWith('/')) {
          const [command, ...args] = text.split(' ');
          await handleCommand(chatId, command.toLowerCase(), args);
        }
      }
      
      // Обрабатываем callback query
      if (update.callback_query) {
        console.log('🔍 BOT: Received callback_query:', update.callback_query.data);
        await handleCallbackQuery(update.callback_query);
      }
    }
  }
  
  // Рекурсивный вызов
  setTimeout(getUpdates, 1000);
}

// ========================================
// Установка webhook (альтернатива polling)
// ========================================
export async function setupBotWebhook(webhookUrl) {
  const result = await callTelegram('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query']
  });
  
  if (result && result.ok) {
    console.log('✅ Вебхук бота установлен:', webhookUrl);
  } else {
    console.log('⚠️ Не удалось установить вебхук бота');
  }
}

// ========================================
// Обработка кнопок (callback_query)
// ========================================
async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  console.log('🔍 BOT: Processing callback_query:', data, 'for user:', userId);

  if (data === 'tarologist_info') {
    // Проверяем, является ли пользователь тарологом
    const tarologist = Tarologist.getByTelegramId(userId.toString());

    if (tarologist) {
      // Показываем профиль существующего таролога
      const balance = Payout.getTarologistBalance(tarologist.id);
      const profileText = `💼 Ваш профиль таролога

Имя: ${tarologist.name}
Telegram ID: ${userId}
Баланс: ${balance} ⭐

Для вывода средств свяжитесь с администратором.`;

      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: profileText
      });
    } else {
      // Показываем инструкцию для новых тарологов
      const registrationText = `💼 Регистрация таролога

Ваш Telegram ID: ${userId}

Чтобы стать тарологом:
1. Скопируйте этот ID
2. Отправьте администратору
3. После регистрации вы сможете получать консультации

💡 Совет: Если вы таролог и хотите участвовать - напишите администратору`;

      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: registrationText
      });
    }
  }

  // Отвечаем на callback_query чтобы убрать "часики"
  await callTelegram('answerCallbackQuery', {
    callback_query_id: query.id
  });
}

// ========================================
// Обработчик webhook
// ========================================
export function handleWebhookUpdate(update) {
  if (update.message) {
    const chatId = update.message.chat.id;
    const text = update.message.text || '';
    
    if (text.startsWith('/')) {
      const [command, ...args] = text.split(' ');
      handleCommand(chatId, command.toLowerCase(), args);
    }
  }
  
  if (update.callback_query) {
    handleCallbackQuery(update.callback_query);
  }
  
  return { ok: true };
}

// ========================================
// Запуск
// ========================================
async function startBot() {
  console.log('🤖 Запуск бота админки...');
  
  // Проверяем токен
  const me = await callTelegram('getMe');
  if (!me || !me.ok) {
    console.error('❌ Не удалось получить информацию о боте. Проверьте токен.');
    return;
  }
  
  console.log(`✅ Бот запущен: @${me.result.username}`);
  console.log(`👤 Admin ID: ${ADMIN_TELEGRAM_ID || 'Не установлен (будет разрешён первый пользователь)'}`);
  console.log(`🌐 Web App URL: ${WEB_APP_URL}`);
  
  // Запускаем long polling
  getUpdates();
}

// Запускаем если файл запущен напрямую
if (process.argv[1]?.endsWith('admin-bot.js')) {
  startBot();
}

export default { startBot, setupBotWebhook, handleWebhookUpdate, handleCommand };
