/**
 * Payment Service
 * Логика работы с платежами и инвойсами
 */

import axios from 'axios';
import dotenv from 'dotenv';
import db from '../db.js';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const IS_TEST_MODE = process.env.TEST_MODE === 'true';

const { Tarologist, User, Transaction, ChatSession } = db;

/**
 * Создать инвойс через Telegram API
 * @param {Object} params - Параметры инвойса
 * @returns {Promise<Object>} - URL инвойса и ID транзакции
 */
export async function createInvoice(params) {
  const { userId, tarologistId, starsAmount } = params;
  
  try {
    // Получаем данные
    const user = User.getById(userId);
    const tarologist = Tarologist.getById(tarologistId);
    
    if (!user || !tarologist) {
      throw new Error('User or tarologist not found');
    }
    
    if (!user.telegram_id) {
      throw new Error('User Telegram ID not found');
    }
    
    // Рассчитываем распределение
    const { platformCut, tarologistCut } = calculateDistribution(starsAmount);
    
    // Создаём транзакцию
    const transaction = Transaction.create({
      userId,
      tarologistId,
      amount: starsAmount,
      starsAmount,
      developerCut: platformCut,
      tarologistCut,
      status: 'pending'
    });
    
    // Создаём инвойс через Telegram API
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
    
    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      invoiceData
    );
    
    if (!response.data.ok) {
      throw new Error(`Telegram API error: ${response.data.description}`);
    }
    
    return {
      transactionId: transaction.id,
      invoiceLink: response.data.result,
      starsAmount
    };
    
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
}

/**
 * Обработать успешный платёж
 * @param {Object} paymentData - Данные от Telegram
 * @returns {Promise<Object>} - Результат обработки
 */
export async function processPayment(paymentData) {
  try {
    const { successful_payment, from } = paymentData.message;
    
    // Извлекаем ID транзакции из payload
    const transactionId = parseInt(successful_payment.invoice_payload.replace('tarot_session_', ''));
    const transaction = Transaction.getById(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    // Обновляем транзакцию
    Transaction.updateStatus(transactionId, 'completed', {
      telegram_payment_id: successful_payment.telegram_payment_charge_id,
      provider_payment_charge_id: successful_payment.provider_payment_charge_id
    });
    
    // Создаём сессию чата
    const session = ChatSession.create({
      userId: transaction.user_id,
      tarologistId: transaction.tarologist_id,
      durationSeconds: 1500 // 25 минут
    });
    
    // Обновляем сессию в транзакции
    Transaction.updateSessionId(transactionId, session.id);
    
    // Уведомляем таролога
    const tarologist = Tarologist.getById(transaction.tarologist_id);
    if (tarologist && tarologist.telegram_id) {
      await sendTelegramMessage(
        tarologist.telegram_id,
        `💰 Новая оплата!\n\nКлиент оплатил консультацию на ${transaction.stars_amount} ⭐\nСессия: #${session.id}`
      );
    }
    
    return {
      success: true,
      transactionId,
      sessionId: session.id
    };
    
  } catch (error) {
    console.error('Error processing payment:', error);
    throw error;
  }
}

/**
 * Выполнить возврат средств
 * @param {number} transactionId - ID транзакции
 * @param {string} reason - Причина возврата
 * @returns {Promise<Object>} - Результат возврата
 */
export async function refund(transactionId, reason = 'Refund by admin') {
  try {
    const transaction = Transaction.getById(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (transaction.status !== 'completed') {
      throw new Error(`Cannot refund transaction with status: ${transaction.status}`);
    }
    
    if (!transaction.telegram_payment_id) {
      throw new Error('No telegram_payment_id for refund');
    }
    
    // Возврат через Telegram API
    const refundResult = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/refundStarPayment`,
      {
        user_id: transaction.user_telegram_id,
        telegram_payment_charge_id: transaction.telegram_payment_id,
        comment: reason
      }
    );
    
    if (!refundResult.data.ok) {
      throw new Error(refundResult.data.description || 'Refund failed');
    }
    
    // Обновляем статус транзакции
    Transaction.updateStatus(transactionId, 'refunded');
    
    // Завершаем сессию если была
    const session = ChatSession.getActiveByUser(transaction.user_id);
    if (session) {
      ChatSession.markCompleted(session.id);
    }
    
    // Уведомляем пользователя
    if (transaction.user_telegram_id) {
      await sendTelegramMessage(
        transaction.user_telegram_id,
        `💰 Возврат средств\n\nОплата за консультацию была отменена.\nСумма: ${transaction.stars_amount} ⭐\nПричина: ${reason}\n\nСредства будут зачислены в течение нескольких минут.`
      );
    }
    
    return {
      success: true,
      refundId: refundResult.data.result?.refund_id
    };
    
  } catch (error) {
    console.error('Error processing refund:', error);
    throw error;
  }
}

/**
 * Рассчитать распределение платежа
 * @param {number} starsAmount - Сумма в звёздах
 * @returns {Object} - platformCut и tarologistCut
 */
export function calculateDistribution(starsAmount) {
  const platformCut = Math.round(starsAmount * 0.1); // 10% комиссия
  const tarologistCut = starsAmount - platformCut;
  return { platformCut, tarologistCut };
}

/**
 * Отправить сообщение через Telegram бота
 * @param {string} telegramId - ID чата
 * @param {string} text - Текст сообщения
 */
async function sendTelegramMessage(telegramId, text) {
  if (!BOT_TOKEN || !telegramId) return;
  
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: telegramId,
      text,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Error sending Telegram message:', error.message);
  }
}
