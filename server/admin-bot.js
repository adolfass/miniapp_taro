/**
 * Admin Bot for Tarot Mini App
 * Бот для доступа к админ-панели
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://your-domain.com';

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
      await handleStart(chatId);
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

async function handleStart(chatId) {
  const welcomeText = `🔮 **Золотое Таро**

Добро пожаловать в админ-панель Tarot Mini App!

**Доступные команды:**
/admin — Открыть админ-панель
/help — Справка

**Статус сервера:** ✅ Работает`;

  // Кнопка для открытия админки
  const keyboard = {
    reply_markup: {
      inline_keyboard: [[
        {
          text: '🔐 Открыть админ-панель',
          web_app: { url: `${WEB_APP_URL}/admin.html` }
        }
      ]]
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
          web_app: { url: `${WEB_APP_URL}/admin.html` }
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

// ========================================
// Long Polling
// ========================================
let lastUpdateId = 0;

async function getUpdates() {
  const data = {
    offset: lastUpdateId + 1,
    timeout: 30
  };

  const result = await callTelegram('getUpdates', data);
  
  if (result && result.ok && Array.isArray(result.result)) {
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
      
      // Обрабатываем callback query (если нужно)
      if (update.callback_query) {
        // Пока ничего не делаем
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

export default { startBot, setupBotWebhook, handleWebhookUpdate };
