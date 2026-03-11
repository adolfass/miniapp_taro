/**
 * Tarologists API Router
 * Роуты для работы с тарологами
 */

import express from 'express';
import { Tarologist } from '../db.js';
import { isTarologist, isAdmin } from '../middleware/auth.js';
import { autoCloseSessions } from '../middleware/auto-close.js';

const router = express.Router();

/**
 * GET /api/tarologists
 * Получить список активных тарологов (для клиентов)
 */
router.get('/', (req, res) => {
  try {
    const tarologists = Tarologist.getAllActive();
    res.json({ success: true, data: tarologists });
  } catch (error) {
    console.error('Error getting tarologists:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/tarologists/:id
 * Получить таролога по ID
 */
router.get('/:id', (req, res) => {
  try {
    const tarologist = Tarologist.getById(req.params.id);
    
    if (!tarologist) {
      return res.status(404).json({ success: false, error: 'Tarologist not found' });
    }
    
    res.json({ success: true, data: tarologist });
  } catch (error) {
    console.error('Error getting tarologist:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/tarologist/:id/status
 * Получить статус таролога (онлайн/офлайн)
 */
router.get('/:id/status', (req, res) => {
  try {
    const tarologistId = parseInt(req.params.id);
    const tarologist = Tarologist.getById(tarologistId);
    
    if (!tarologist) {
      return res.status(404).json({ success: false, error: 'Tarologist not found' });
    }
    
    const isOnline = Tarologist.isRealOnline(tarologistId);
    
    res.json({
      success: true,
      data: {
        id: tarologist.id,
        is_online: isOnline,
        ready_until: tarologist.ready_until
      }
    });
  } catch (error) {
    console.error('Error getting tarologist status:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/tarologist/:id/heartbeat
 * Heartbeat от таролога (HTTP fallback)
 */
router.post('/:id/heartbeat', (req, res) => {
  try {
    const tarologistId = parseInt(req.params.id);
    const { initData } = req.body;
    
    // Валидация initData
    const params = new URLSearchParams(initData);
    const userJson = params.get('user');
    
    if (!userJson) {
      return res.status(401).json({ success: false, error: 'No user data' });
    }
    
    const userData = JSON.parse(userJson);
    const tarologist = Tarologist.getById(tarologistId);
    
    if (!tarologist || tarologist.telegram_id !== userData.id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Обновляем heartbeat
    Tarologist.heartbeat(tarologistId);
    
    // Проверяем реальный онлайн статус
    const isOnline = Tarologist.isRealOnline(tarologistId);
    
    res.json({
      success: true,
      data: {
        is_online: isOnline,
        last_heartbeat_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error in heartbeat:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/tarologist/:id/ready
 * Таролог подтверждает готовность
 */
router.post('/:id/ready', (req, res) => {
  try {
    const tarologistId = parseInt(req.params.id);
    const { initData, duration = 30 } = req.body;
    
    // Валидация
    const params = new URLSearchParams(initData);
    const userJson = params.get('user');
    
    if (!userJson) {
      return res.status(401).json({ success: false, error: 'No user data' });
    }
    
    const userData = JSON.parse(userJson);
    const tarologist = Tarologist.getById(tarologistId);
    
    if (!tarologist || tarologist.telegram_id !== userData.id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Устанавливаем статус готовности
    Tarologist.setReady(tarologistId, duration);
    
    // Обновляем статус в БД
    Tarologist.setOnlineStatus(tarologistId, true);
    
    res.json({
      success: true,
      data: {
        is_online: true,
        ready_until: new Date(Date.now() + duration * 60000).toISOString()
      }
    });
  } catch (error) {
    console.error('Error setting ready status:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
