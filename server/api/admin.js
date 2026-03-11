/**
 * Admin API Router
 * Роуты для админ-панели
 */

import express from 'express';
import db, { Tarologist, Transaction, Payout, ChatSession } from '../db.js';
import { isAdmin } from '../middleware/auth.js';

const router = express.Router();

// ========================================
// Статистика
// ========================================

/**
 * GET /api/admin/stats
 * Общая статистика
 */
router.get('/stats', isAdmin, (req, res) => {
  try {
    // Общая статистика
    const statsStmt = db.db.prepare(`
      SELECT 
        COUNT(*) as total_sessions,
        SUM(stars_amount) as total_revenue,
        SUM(developer_cut) as total_commission
      FROM transactions
      WHERE status = 'completed'
    `);
    const stats = statsStmt.get();
    
    // Количество тарологов
    const tarologistsStmt = db.db.prepare('SELECT COUNT(*) as count FROM tarologists WHERE is_active = 1');
    const tarologists = tarologistsStmt.get();
    
    // Возвраты
    const refundsStmt = db.db.prepare(`
      SELECT 
        COUNT(*) as count,
        SUM(stars_amount) as total
      FROM transactions
      WHERE status = 'refunded'
    `);
    const refunds = refundsStmt.get();
    
    // Баланс к выплате
    const payoutStmt = db.db.prepare(`
      SELECT 
        COALESCE(SUM(tr.tarologist_cut), 0) - COALESCE(SUM(p.amount), 0) as total_payout
      FROM tarologists t
      LEFT JOIN transactions tr ON t.id = tr.tarologist_id AND tr.status = 'completed' AND tr.status != 'refunded'
      LEFT JOIN payouts p ON t.id = p.tarologist_id AND p.status = 'completed'
    `);
    const totalPayout = payoutStmt.get().total_payout || 0;
    
    res.json({
      success: true,
      data: {
        totalRevenue: stats.total_revenue || 0,
        developerCut: stats.total_commission || 0,
        totalTarologists: tarologists.count,
        totalSessions: stats.total_sessions,
        totalRefunds: refunds.count || 0,
        totalRefundsAmount: refunds.total || 0,
        totalPayout: totalPayout
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ========================================
// Тарологи
// ========================================

/**
 * GET /api/admin/tarologists
 * Список всех тарологов
 */
router.get('/tarologists', isAdmin, (req, res) => {
  try {
    const tarologists = Tarologist.getAll();
    
    // Добавляем баланс каждому
    const withBalance = tarologists.map(t => ({
      ...t,
      balance: Payout.getTarologistBalance(t.id)
    }));
    
    res.json({ success: true, data: withBalance });
  } catch (error) {
    console.error('Error getting tarologists:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/tarologist/:id
 * Информация о тарологе
 */
router.get('/tarologist/:id', isAdmin, (req, res) => {
  try {
    const tarologist = Tarologist.getById(req.params.id);
    
    if (!tarologist) {
      return res.status(404).json({ success: false, error: 'Tarologist not found' });
    }
    
    const balance = Payout.getTarologistBalance(tarologist.id);
    
    // Статистика
    const statsStmt = db.db.prepare(`
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
    console.error('Error getting tarologist:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/tarologist/:id/unrated-sessions
 * Сессии без оценки
 */
router.get('/tarologist/:id/unrated-sessions', isAdmin, (req, res) => {
  try {
    const tarologistId = parseInt(req.params.id);
    const sessions = ChatSession.getUnratedSessions(tarologistId);
    
    res.json({ success: true, data: sessions });
  } catch (error) {
    console.error('Error getting unrated sessions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/tarologist
 * Создать таролога
 */
router.post('/tarologist', isAdmin, async (req, res) => {
  try {
    const { telegram_id, name, description, photo_url } = req.body;
    
    if (!telegram_id) {
      return res.status(400).json({ success: false, error: 'Telegram ID required' });
    }
    
    // Проверяем, не существует ли уже
    const existing = db.db.prepare('SELECT id FROM tarologists WHERE telegram_id = ?').get(telegram_id);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Tarologist already exists' });
    }
    
    const result = Tarologist.create({
      telegram_id,
      name: name || 'Аноним',
      description,
      photo_url
    });
    
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('Error creating tarologist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/admin/tarologist/:id
 * Обновить таролога
 */
router.put('/tarologist/:id', isAdmin, (req, res) => {
  try {
    const { name, description, photo_url } = req.body;
    
    const stmt = db.db.prepare(`
      UPDATE tarologists 
      SET name = ?, description = ?, photo_url = ?
      WHERE id = ?
    `);
    stmt.run(name, description, photo_url, req.params.id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating tarologist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/admin/tarologist/:id/disable
 * Отключить таролога
 */
router.put('/tarologist/:id/disable', isAdmin, (req, res) => {
  try {
    const stmt = db.db.prepare('UPDATE tarologists SET is_active = 0 WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error disabling tarologist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/admin/tarologist/:id/enable
 * Включить таролога
 */
router.put('/tarologist/:id/enable', isAdmin, (req, res) => {
  try {
    const stmt = db.db.prepare('UPDATE tarologists SET is_active = 1 WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error enabling tarologist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/tarologist/:id
 * Удалить таролога
 */
router.delete('/tarologist/:id', isAdmin, (req, res) => {
  try {
    const stmt = db.db.prepare('DELETE FROM tarologists WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting tarologist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// Транзакции
// ========================================

/**
 * GET /api/admin/transactions
 * Список транзакций
 */
router.get('/transactions', isAdmin, (req, res) => {
  try {
    const stmt = db.db.prepare(`
      SELECT t.*, u.telegram_id as user_telegram_id, tar.name as tarologist_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      JOIN tarologists tar ON t.tarologist_id = tar.id
      ORDER BY t.created_at DESC
      LIMIT 100
    `);
    const transactions = stmt.all();
    
    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/transaction/:id
 * Информация о транзакции
 */
router.get('/transaction/:id', isAdmin, (req, res) => {
  try {
    const transaction = Transaction.getById(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }
    
    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error('Error getting transaction:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ========================================
// Выплаты
// ========================================

/**
 * GET /api/admin/payouts
 * Список выплат
 */
router.get('/payouts', isAdmin, (req, res) => {
  try {
    const payouts = Payout.getAll();
    res.json({ success: true, data: payouts });
  } catch (error) {
    console.error('Error getting payouts:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/payouts
 * Создать выплату
 */
router.post('/payouts', isAdmin, (req, res) => {
  try {
    const { tarologist_id, amount } = req.body;
    
    const payout = Payout.create({
      tarologistId: tarologist_id,
      amount,
      status: 'pending'
    });
    
    res.json({ success: true, data: payout });
  } catch (error) {
    console.error('Error creating payout:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
