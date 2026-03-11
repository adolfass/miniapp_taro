/**
 * Payments API Router
 * Роуты для работы с платежами
 */

import express from 'express';
import { createInvoice, processPayment, refund } from '../services/payment-service.js';
import { isAdmin } from '../middleware/auth.js';
import db from '../db.js';

const router = express.Router();
const { Transaction, Payout } = db;

/**
 * POST /api/create-invoice
 * Создать инвойс для оплаты
 */
router.post('/create-invoice', async (req, res) => {
  try {
    const { tarologistId, userId } = req.body;
    
    if (!tarologistId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'tarologistId and userId are required'
      });
    }
    
    const tarologist = db.Tarologist.getById(tarologistId);
    
    if (!tarologist) {
      return res.status(404).json({
        success: false,
        error: 'Tarologist not found'
      });
    }
    
    if (!tarologist.is_online) {
      return res.status(400).json({
        success: false,
        error: 'Tarologist is offline'
      });
    }
    
    // Создаём инвойс
    const result = await createInvoice({
      userId,
      tarologistId,
      starsAmount: tarologist.price
    });
    
    res.json({ success: true, data: result });
    
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create invoice'
    });
  }
});

/**
 * POST /api/payment-webhook
 * Вебхук от Telegram о статусе платежа
 */
router.post('/payment-webhook', async (req, res) => {
  try {
    const update = req.body;
    
    console.log('💰 PAYMENT WEBHOOK', {
      type: update.pre_checkout_query ? 'PRE_CHECKOUT' :
            update.message?.successful_payment ? 'SUCCESSFUL_PAYMENT' :
            'UNKNOWN',
      timestamp: new Date().toISOString()
    });
    
    // Успешный платёж
    if (update.message?.successful_payment) {
      await processPayment(update);
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error in payment webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/cancel-payment
 * Отменить платёж и вернуть средства
 */
router.post('/admin/cancel-payment', isAdmin, async (req, res) => {
  try {
    const { transactionId, reason } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: 'transactionId is required'
      });
    }
    
    const result = await refund(transactionId, reason);
    
    res.json(result);
    
  } catch (error) {
    console.error('Error canceling payment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process refund'
    });
  }
});

export default router;
