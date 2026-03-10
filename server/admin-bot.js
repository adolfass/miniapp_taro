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
    
    case '/ready':
    case '/готов':
      await handleReadyCommand(chatId);
      break;
    
    case '/status':
    case '/статус':
      await handleStatusCommand(chatId);
      break;
    
    default:
      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: 'Неизвестная команда. Используйте /help для справки.'
      });
  }
}

/**
 * Команда /ready - таролог подтверждает готовность
 */
async function handleReadyCommand(chatId) {
  const tarologist = Tarologist.getByTelegramId(chatId.toString());
  
  if (!tarologist) {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '❌ Вы не зарегистрированы как таролог.\n\nЧтобы стать тарологом, свяжитесь с администратором.'
    });
    return;
  }
  
  // Устанавливаем статус готовности
  Tarologist.setReady(tarologist.id, 30);
  
  // ВАЖНО: Перезагружаем данные после обновления
  const updatedTarologist = Tarologist.getByTelegramId(chatId.toString());
  
  // Проверяем, является ли админом
  const isAdmin = ADMIN_TELEGRAM_ID && chatId.toString() === ADMIN_TELEGRAM_ID;
  
  // Показываем обновлённое меню (с учетом роли админа)
  if (isAdmin) {
    await showAdminTarologistMenu(chatId, updatedTarologist);
  } else {
    await showTarologistMenu(chatId, updatedTarologist);
  }
  
  // Отправляем подтверждение
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: `🟢 Отлично! Вы теперь видны клиентам.\n\n⏱️ Статус активен 30 минут.\n💡 Клиенты могут выбрать вас для консультации.`,
    parse_mode: 'Markdown'
  });
}

/**
 * Команда /status - проверить свой статус
 */
async function handleStatusCommand(chatId) {
  const tarologist = Tarologist.getByTelegramId(chatId.toString());
  
  if (!tarologist) {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '❌ Вы не зарегистрированы как таролог.'
    });
    return;
  }
  
  // Проверяем, является ли админом
  const isAdmin = ADMIN_TELEGRAM_ID && chatId.toString() === ADMIN_TELEGRAM_ID;
  
  // Показываем меню со статусом (с учетом роли админа)
  if (isAdmin) {
    await showAdminTarologistMenu(chatId, tarologist);
  } else {
    await showTarologistMenu(chatId, tarologist);
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
  
  // Проверяем, является ли пользователь админом
  const isAdmin = ADMIN_TELEGRAM_ID && chatId.toString() === ADMIN_TELEGRAM_ID;
  
  // Проверяем, является ли пользователь тарологом
  const tarologist = Tarologist.getByTelegramId(chatId.toString());
  
  // Если пользователь И админ И таролог - показываем специальное комбинированное меню
  if (isAdmin && tarologist) {
    await showAdminTarologistMenu(chatId, tarologist);
    return;
  }
  
  // Если только таролог - показываем меню таролога
  if (tarologist) {
    await showTarologistMenu(chatId, tarologist);
    return;
  }
  
  // Если только админ - показываем админ-меню
  if (isAdmin) {
    const welcomeText = `🔮 **Золотое Таро**

Добро пожаловать в админ-панель Tarot Mini App!

**Доступные команды:**
/admin — Открыть админ-панель
/help — Справка

**Статус сервера:** ✅ Работает`;

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
    return;
  }
  
  // Обычный пользователь
  const welcomeText = `🔮 **Золотое Таро**

Добро пожаловать!

Этот бот помогает получить консультацию от профессиональных тарологов.

**Доступные команды:**
/help — Справка

**Статус сервера:** ✅ Работает`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
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

/**
 * Показать комбинированное меню для админа-таролога
 */
async function showAdminTarologistMenu(chatId, tarologist) {
  const isOnline = Tarologist.isRealOnline(tarologist.id);
  const balance = Payout.getTarologistBalance(tarologist.id);
  
  // Формируем статус
  let statusEmoji = isOnline ? '🟢' : '🔴';
  let statusText = isOnline ? 'Онлайн' : 'Оффлайн';
  
  // Проверяем активную сессию
  const db = (await import('./db.js')).default;
  const activeSession = db.prepare(`
    SELECT COUNT(*) as count 
    FROM chat_sessions 
    WHERE tarologist_id = ? AND active = 1
  `).get(tarologist.id);
  
  let sessionText = '';
  if (activeSession.count > 0) {
    sessionText = '\n📱 Активная консультация';
  }
  
  // Проверяем ready_until
  let readyText = '';
  if (tarologist.ready_until) {
    const readyUntil = new Date(tarologist.ready_until);
    const now = new Date();
    if (readyUntil > now) {
      const minutesLeft = Math.ceil((readyUntil - now) / 60000);
      readyText = `\n⏱️ Готов ещё ${minutesLeft} мин`;
    }
  }
  
  const menuText = `👑 **Админ + Таролог**

💼 Ваш профиль:
👤 Имя: ${tarologist.name}
${statusEmoji} Статус: ${statusText}${readyText}${sessionText}
💰 Баланс: ${balance} ⭐
✨ Консультаций: ${tarologist.sessions_completed || 0}
⭐ Рейтинг: ${tarologist.rating?.toFixed(1) || '5.0'}

🔐 **Вы также администратор**`;

  // Кнопки для админа-таролога
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{
          text: '🔐 Админ-панель',
          web_app: { url: `${WEB_APP_URL}/admin.html?v=${Date.now()}` }
        }],
        [{
          text: '💬 Мои чаты',
          web_app: { url: `${WEB_APP_URL}/tarologist-chat.html?v=${Date.now()}` }
        }],
        [{
          text: '🟢 Готов консультировать (30 мин)',
          callback_data: 'tarologist_ready'
        }],
        [{
          text: '📊 Мой профиль',
          callback_data: 'tarologist_info'
        }]
      ]
    },
    parse_mode: 'Markdown'
  };

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: menuText,
    ...keyboard
  });
}

/**
 * Показать меню для таролога
 */
async function showTarologistMenu(chatId, tarologist) {
  const isOnline = Tarologist.isRealOnline(tarologist.id);
  const balance = Payout.getTarologistBalance(tarologist.id);
  
  // Формируем статус
  let statusEmoji = isOnline ? '🟢' : '🔴';
  let statusText = isOnline ? 'Онлайн' : 'Оффлайн';
  
  // Проверяем активную сессию
  const db = (await import('./db.js')).default;
  const activeSession = db.prepare(`
    SELECT COUNT(*) as count 
    FROM chat_sessions 
    WHERE tarologist_id = ? AND active = 1
  `).get(tarologist.id);
  
  let sessionText = '';
  if (activeSession.count > 0) {
    sessionText = '\n📱 Активная консультация';
  }
  
  // Проверяем ready_until
  let readyText = '';
  if (tarologist.ready_until) {
    const readyUntil = new Date(tarologist.ready_until);
    const now = new Date();
    if (readyUntil > now) {
      const minutesLeft = Math.ceil((readyUntil - now) / 60000);
      readyText = `\n⏱️ Готов ещё ${minutesLeft} мин`;
    }
  }
  
  const menuText = `💼 **Ваш профиль таролога**

👤 Имя: ${tarologist.name}
${statusEmoji} Статус: ${statusText}${readyText}${sessionText}
💰 Баланс: ${balance} ⭐
✨ Консультаций: ${tarologist.sessions_completed || 0}
⭐ Рейтинг: ${tarologist.rating?.toFixed(1) || '5.0'}

Чтобы получать клиентов, нажмите кнопку ниже:`;

  // Кнопки для таролога
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{
          text: '💬 Мои чаты',
          web_app: { url: `${WEB_APP_URL}/tarologist-chat.html?v=${Date.now()}` }
        }],
        [{
          text: '🟢 Готов консультировать (30 мин)',
          callback_data: 'tarologist_ready'
        }],
        [{
          text: '📊 Мой профиль',
          callback_data: 'tarologist_info'
        }]
      ]
    },
    parse_mode: 'Markdown'
  };

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: menuText,
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
  // Проверяем роли пользователя
  const tarologist = Tarologist.getByTelegramId(chatId.toString());
  const isAdmin = ADMIN_TELEGRAM_ID && chatId.toString() === ADMIN_TELEGRAM_ID;
  
  // Если админ И таролог - специальная справка
  if (isAdmin && tarologist) {
    const adminTarologistHelpText = `📖 **Справка для Админа-Таролога**

**Команды таролога:**
/start — Главное меню со статусом
/ready (или /готов) — Подтвердить готовность на 30 мин
/status (или /статус) — Проверить текущий статус

**Команды админа:**
/admin — Открыть админ-панель

**Как работает онлайн статус:**
🟢 Клиенты видят вас онлайн, если:
• Вы нажали "Готов консультировать" (30 мин)
• У вас есть активная консультация
• Ваше приложение открыто (heartbeat)

💰 Выплаты производятся по запросу.`;

    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: adminTarologistHelpText,
      parse_mode: 'Markdown'
    });
    return;
  }
  
  // Если только таролог
  if (tarologist) {
    const tarologistHelpText = `📖 **Справка для таролога**

/start — Главное меню со статусом
/ready (или /готов) — Подтвердить готовность на 30 мин
/status (или /статус) — Проверить текущий статус
/help — Эта справка

**Как работает онлайн статус:**
🟢 Клиенты видят вас онлайн, если:
• Вы нажали "Готов консультировать" (30 мин)
• У вас есть активная консультация
• Ваше приложение открыто (heartbeat)

💰 Выплаты производятся по запросу администратору.`;

    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: tarologistHelpText,
      parse_mode: 'Markdown'
    });
    return;
  }
  
  // Справка для админа/обычного пользователя
  const helpText = `📖 **Справка по командам**

/start — Запустить бота
/admin — Открыть админ-панель
/help — Эта справка

**Админ-панель позволяет:**
• Просматривать статистику по доходам
• Видеть список тарологов с балансом
• Просматривать все транзакции
• Отмечать выплаты тарологам

**Для тарологов:**
Если вы таролог — админ добавит вас в систему, и вы сможете управлять своим статусом через этого бота.`;

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
        
        // Обрабатываем успешную оплату (successful_payment)
        if (update.message.successful_payment) {
          console.log('💰 BOT: Received successful_payment:', update.message.successful_payment);
          await handleSuccessfulPayment(update.message);
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

  if (data === 'tarologist_ready') {
    // Таролог нажал "Готов консультировать"
    const tarologist = Tarologist.getByTelegramId(userId.toString());
    
    if (!tarologist) {
      await callTelegram('answerCallbackQuery', {
        callback_query_id: query.id,
        text: '❌ Вы не зарегистрированы как таролог',
        show_alert: true
      });
      return;
    }
    
    // Устанавливаем статус готовности (30 минут)
    Tarologist.setReady(tarologist.id, 30);
    
    // ВАЖНО: Перезагружаем данные таролога после обновления!
    const updatedTarologist = Tarologist.getByTelegramId(userId.toString());
    
    // Проверяем, является ли пользователь админом
    const isAdmin = ADMIN_TELEGRAM_ID && userId.toString() === ADMIN_TELEGRAM_ID;
    
    // Отправляем подтверждение
    await callTelegram('answerCallbackQuery', {
      callback_query_id: query.id,
      text: '✅ Вы теперь онлайн! Клиенты могут видеть вас.',
      show_alert: true
    });
    
    // Обновляем меню с новым статусом (админ-таролог или обычный таролог)
    if (isAdmin) {
      await showAdminTarologistMenu(chatId, updatedTarologist);
    } else {
      await showTarologistMenu(chatId, updatedTarologist);
    }
    
    // Отправляем уведомление о времени
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: `🟢 Вы в статусе "онлайн" следующие 30 минут.\n\n💡 Совет: Если клиент выберет вас, вы получите уведомление.\n\n⏰ Статус автоматически сбросится через 30 минут, или вы можете обновить его снова.`,
      parse_mode: 'Markdown'
    });
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
