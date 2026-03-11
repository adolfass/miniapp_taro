/**
 * Chat API Router
 * Роуты для работы с чатом и сессиями
 */

import express from 'express';
import { ChatSession, Message } from '../db.js';
import { isTarologist } from '../middleware/auth.js';
import { autoCloseSessions } from '../middleware/auto-close.js';

const router = express.Router();

/**
 * GET /api/session/:id/status
 * Получить статус сессии
 */
router.get('/session/:id/status', (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const session = ChatSession.getById(sessionId);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    // Автоматически закрываем просроченные сессии
    ChatSession.autoCloseOldSessions();
    
    // Перезагружаем сессию после возможного закрытия
    const updatedSession = ChatSession.getById(sessionId);
    
    // Вычисляем оставшееся время
    let timeLeft = 0;
    let timeLeftSeconds = 0;
    if (updatedSession.active) {
      const startTime = new Date(updatedSession.start_time).getTime();
      const now = Date.now();
      const elapsed = (now - startTime) / 1000;
      timeLeftSeconds = Math.max(0, updatedSession.duration_seconds - elapsed);
      timeLeft = Math.ceil(timeLeftSeconds / 60);
    }
    
    // Проверяем, можно ли оценить
    const canRate = ChatSession.canRate(sessionId);
    
    res.json({
      success: true,
      data: {
        id: updatedSession.id,
        is_active: updatedSession.active === 1,
        is_completed: updatedSession.completed === 1,
        is_rated: updatedSession.rated === 1,
        can_rate: canRate,
        time_left_minutes: timeLeft,
        time_left_seconds: timeLeftSeconds,
        duration_seconds: updatedSession.duration_seconds,
        start_time: updatedSession.start_time,
        end_time: updatedSession.end_time,
        tarologist_id: updatedSession.tarologist_id,
        user_id: updatedSession.user_id
      }
    });
  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/session/:id/rate
 * Сохранить оценку сессии
 */
router.post('/session/:id/rate', (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { rating, comment } = req.body;
    
    // Валидация
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be between 1 and 5'
      });
    }
    
    // Проверяем, можно ли оценить
    if (!ChatSession.canRate(sessionId)) {
      return res.status(400).json({
        success: false,
        error: 'Session cannot be rated'
      });
    }
    
    // Сохраняем оценку
    const updatedSession = ChatSession.submitRating(sessionId, rating, comment);
    
    res.json({
      success: true,
      data: {
        session_id: updatedSession.id,
        rated: true,
        rating: updatedSession.rating,
        rating_comment: updatedSession.rating_comment,
        rated_at: updatedSession.rated_at,
        message: 'Thank you for your feedback!'
      }
    });
  } catch (error) {
    console.error('Error submitting rating:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/session/:id/messages
 * Получить сообщения сессии
 */
router.get('/session/:id/messages', (req, res) => {
  try {
    const messages = Message.getBySession(parseInt(req.params.id));
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/tarologist/sessions/active
 * Получить активные сессии таролога
 */
router.get('/tarologist/sessions/active', isTarologist, autoCloseSessions, (req, res) => {
  try {
    const sessions = ChatSession.getActiveByTarologist(req.tarologist.id);
    res.json({ success: true, data: sessions });
  } catch (error) {
    console.error('Error getting active sessions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/chat/session/:id/messages
 * Получить сообщения сессии (для таролога)
 */
router.get('/chat/session/:id/messages', isTarologist, autoCloseSessions, (req, res) => {
  try {
    const sessionId = req.params.id;
    
    // Проверяем, что сессия принадлежит этому тарологу
    const session = ChatSession.getById(sessionId);
    if (!session || session.tarologist_id !== req.tarologist.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const messages = Message.getBySession(sessionId);
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Error getting chat messages:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
