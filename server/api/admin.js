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

// ========================================
// МЕТРИКИ И АНАЛИТИКА
// ========================================

/**
 * GET /api/admin/stats/dau
 * Daily Active Users за N дней
 */
router.get('/stats/dau', isAdmin, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const stmt = db.db.prepare(`
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
router.get('/stats/wau', isAdmin, (req, res) => {
  try {
    const weeks = parseInt(req.query.weeks) || 12;

    const stmt = db.db.prepare(`
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
router.get('/stats/mau', isAdmin, (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;

    const stmt = db.db.prepare(`
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
 * GET /api/admin/stats/funnel
 * Воронка: app_open → spread_selected → cards_flipped → payment_completed
 */
router.get('/stats/funnel', isAdmin, (req, res) => {
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
      const stmt = db.db.prepare(`
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
router.get('/stats/conversion', isAdmin, (req, res) => {
  try {
    const target = req.query.target || 'payment_completed';
    const days = parseInt(req.query.days) || 30;

    // Пользователи открывшие приложение
    const appOpenStmt = db.db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM events
      WHERE event_type = 'app_open'
        AND created_at >= datetime('now', '-${days} days')
    `);
    const appOpen = appOpenStmt.get().count;

    // Пользователи совершившие целевое действие
    const targetStmt = db.db.prepare(`
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
router.get('/stats/ltv', isAdmin, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    // Общее количество уникальных пользователей
    const totalUsersStmt = db.db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM events
      WHERE event_type = 'app_open'
    `);
    const totalUsers = totalUsersStmt.get().count;

    // Общий доход
    const revenueStmt = db.db.prepare(`
      SELECT COALESCE(SUM(stars_amount), 0) as total
      FROM transactions
      WHERE status = 'completed'
        AND created_at >= datetime('now', '-${days} days')
    `);
    const totalRevenue = revenueStmt.get().total;

    // Платящие пользователи
    const payingUsersStmt = db.db.prepare(`
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
 * GET /api/admin/stats/retention
 * Retention Rate — процент пользователей, вернувшихся на X-й день
 * Retention D1, D7, D30
 */
router.get('/stats/retention', isAdmin, (req, res) => {
  try {
    const days = [1, 7, 30]; // D1, D7, D30
    const cohortDays = parseInt(req.query.cohort_days) || 30; // За сколько дней назад смотрим когорту

    // Получаем когорту пользователей (первый вход)
    const cohortStmt = db.db.prepare(`
      SELECT 
        user_id,
        MIN(created_at) as first_visit
      FROM events
      WHERE event_type = 'app_open'
        AND created_at >= datetime('now', '-${cohortDays} days')
      GROUP BY user_id
    `);
    const cohort = cohortStmt.all();
    const totalCohortUsers = cohort.length;

    if (totalCohortUsers === 0) {
      return res.json({
        success: true,
        data: {
          cohort_size: 0,
          retention: { D1: 0, D7: 0, D30: 0 }
        }
      });
    }

    // Считаем retention для каждого дня
    const retention = {};
    
    days.forEach(day => {
      const returnedUsersStmt = db.db.prepare(`
        SELECT COUNT(DISTINCT e.user_id) as count
        FROM events e
        JOIN (
          SELECT user_id, MIN(created_at) as first_visit
          FROM events
          WHERE event_type = 'app_open'
            AND created_at >= datetime('now', '-${cohortDays} days')
          GROUP BY user_id
        ) first ON e.user_id = first.user_id
        WHERE e.event_type = 'app_open'
          AND date(e.created_at) = date(first.first_visit, '+${day} days')
      `);
      
      const returnedCount = returnedUsersStmt.get().count;
      retention[`D${day}`] = totalCohortUsers > 0 ? ((returnedCount / totalCohortUsers) * 100).toFixed(2) : 0;
    });

    res.json({
      success: true,
      data: {
        cohort_size: totalCohortUsers,
        cohort_period: `${cohortDays} days`,
        retention,
        interpretation: {
          D1: 'Процент пользователей, вернувшихся на следующий день',
          D7: 'Процент пользователей, вернувшихся через 7 дней',
          D30: 'Процент пользователей, вернувшихся через 30 дней'
        }
      }
    });
  } catch (error) {
    console.error('Retention stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats/session-length
 * Длительность сессий — среднее время, проведённое пользователем в приложении
 */
router.get('/stats/session-length', isAdmin, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    // Получаем время входа и выхода для каждой сессии
    // Считаем сессию завершённой, если между событиями > 30 минут или есть app_close
    const sessionsStmt = db.db.prepare(`
      SELECT 
        user_id,
        created_at as session_start,
        (
          SELECT MIN(e2.created_at)
          FROM events e2
          WHERE e2.user_id = e1.user_id
            AND e2.created_at > e1.created_at
            AND (e2.event_type = 'app_close' 
                 OR (julianday(e2.created_at) - julianday(e1.created_at)) * 24 * 60 > 30)
        ) as session_end
      FROM events e1
      WHERE e1.event_type = 'app_open'
        AND e1.created_at >= datetime('now', '-${days} days')
      ORDER BY e1.user_id, e1.created_at
    `);

    const sessions = sessionsStmt.all();

    // Считаем длительность сессий
    let totalDuration = 0;
    let validSessions = 0;
    const durations = [];

    sessions.forEach(session => {
      if (session.session_end) {
        const start = new Date(session.session_start);
        const end = new Date(session.session_end);
        const durationMinutes = (end - start) / (1000 * 60); // в минутах
        
        if (durationMinutes > 0 && durationMinutes <= 120) { // Исключаем выбросы > 2 часов
          totalDuration += durationMinutes;
          validSessions++;
          durations.push(durationMinutes);
        }
      }
    });

    // Считаем процентили
    durations.sort((a, b) => a - b);
    const avgDuration = validSessions > 0 ? (totalDuration / validSessions).toFixed(2) : 0;
    const medianDuration = durations.length > 0 ? durations[Math.floor(durations.length / 2)].toFixed(2) : 0;
    const p90Duration = durations.length > 0 ? durations[Math.floor(durations.length * 0.9)].toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        total_sessions: sessions.length,
        valid_sessions: validSessions,
        avg_duration_minutes: parseFloat(avgDuration),
        median_duration_minutes: parseFloat(medianDuration),
        p90_duration_minutes: parseFloat(p90Duration),
        period: `${days} days`
      }
    });
  } catch (error) {
    console.error('Session length stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats/vitality
 * K-factor (Vitality) — вирусный коэффициент роста
 * K = (приглашённые пользователи / текущие пользователи) * конверсия в установку
 */
router.get('/stats/vitality', isAdmin, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    // Получаем текущих активных пользователей
    const currentUsersStmt = db.db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM events
      WHERE event_type = 'app_open'
        AND created_at >= datetime('now', '-${days} days')
    `);
    const currentUsers = currentUsersStmt.get().count;

    // Получаем количество приглашённых пользователей (через invite events)
    // Предполагаем, что приглашения отслеживаются через event_type = 'user_invited'
    const invitedUsersStmt = db.db.prepare(`
      SELECT COUNT(DISTINCT event_data) as count
      FROM events
      WHERE event_type = 'user_invited'
        AND created_at >= datetime('now', '-${days} days')
    `);
    const invitedUsersResult = invitedUsersStmt.get();
    const invitedUsers = invitedUsersResult ? invitedUsersResult.count : 0;

    // Конверсия в установку (приглашённые, которые действительно открыли приложение)
    // Это упрощённая метрика - реально нужно отслеживать реферальные ссылки
    const installedFromInviteStmt = db.db.prepare(`
      SELECT COUNT(DISTINCT e1.user_id) as count
      FROM events e1
      WHERE e1.event_type = 'app_open'
        AND e1.created_at >= datetime('now', '-${days} days')
        AND EXISTS (
          SELECT 1 FROM events e2
          WHERE e2.event_type = 'user_invited'
            AND e2.created_at < e1.created_at
            AND json_extract(e2.event_data, '$.invited_user_id') = e1.user_id
        )
    `);
    const installedCount = installedFromInviteStmt.get()?.count || 0;

    // K-factor
    const conversionRate = invitedUsers > 0 ? (installedCount / invitedUsers) : 0;
    const kFactor = currentUsers > 0 ? ((invitedUsers / currentUsers) * conversionRate).toFixed(3) : 0;

    res.json({
      success: true,
      data: {
        k_factor: parseFloat(kFactor),
        current_users: currentUsers,
        invited_users: invitedUsers,
        installed_from_invite: installedCount,
        conversion_rate: (conversionRate * 100).toFixed(2),
        interpretation: {
          k_factor: parseFloat(kFactor) > 1 ? 'Вирусный рост!' : parseFloat(kFactor) > 0.5 ? 'Хороший рост' : 'Нужны улучшения',
          meaning: 'K > 1 означает вирусный рост (каждый пользователь приводит >1 нового)'
        },
        period: `${days} days`
      }
    });
  } catch (error) {
    console.error('Vitality stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats/revenue
 * Доход по периодам
 */
router.get('/stats/revenue', isAdmin, (req, res) => {
  try {
    const period = req.query.period || 'monthly'; // daily, weekly, monthly
    const limit = parseInt(req.query.limit) || 12;

    const format = period === 'daily' ? '%Y-%m-%d' : period === 'weekly' ? '%Y-%W' : '%Y-%m';
    const dateCalc = period === 'daily' ? `${limit} days` : period === 'weekly' ? `${limit} weeks` : `${limit} months`;

    const stmt = db.db.prepare(`
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
router.get('/stats/top-tarologists', isAdmin, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 3;

    const stmt = db.db.prepare(`
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

export default router;
