/**
 * Bot Webhook Handler
 * Обработка webhook от Telegram бота
 */

import axios from 'axios';
import dotenv from 'dotenv';
import db from '../db.js';
import { processPayment } from '../services/payment-service.js';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Обработать webhook update от Telegram
 * @param {Object} update - Данные от Telegram
 */
export async function handleWebhook(update) {
  console.log('🔍 BOT: Received webhook update');
  
  try {
    // Обработка сообщений
    if (update.message) {
      // Успешный платёж
      if (update.message.successful_payment) {
        await handleSuccessfulPayment(update.message);
      }
      
      // Команды бота
      if (update.message.text && update.message.text.startsWith('/')) {
        await handleCommand(update.message);
      }
    }
    
    // Обработка callback queries
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
    
    // Pre-checkout query
    if (update.pre_checkout_query) {
      await handlePreCheckout(update.pre_checkout_query);
    }
    
  } catch (error) {
    console.error('Error handling webhook:', error);
  }
}

/**
 * Обработать успешный платёж
 */
async function handleSuccessfulPayment(message) {
  console.log('💰 Successful payment:', message.successful_payment);
  
  try {
    await processPayment({ message });
  } catch (error) {
    console.error('Error processing payment:', error);
  }
}

/**
 * Обработать команду бота
 */
async function handleCommand(message) {
  const chatId = message.chat.id;
  const text = message.text;
  
  console.log('🤖 Command:', text, 'from:', chatId);
  
  // Здесь можно добавить обработку команд
  // Например, интеграция с admin-bot.js
}

/**
 * Обработать callback query
 */
async function handleCallbackQuery(query) {
  console.log('🔘 Callback query:', query.data);
  
  // Отвечаем на callback
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    callback_query_id: query.id
  });
}

/**
 * Обработать pre-checkout query
 */
async function handlePreCheckout(query) {
  console.log('💳 Pre-checkout query:', query.id);
  
  // Подтверждаем оплату
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
    pre_checkout_query_id: query.id,
    ok: true
  });
}

export default { handleWebhook };
