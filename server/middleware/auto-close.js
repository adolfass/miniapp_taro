/**
 * Auto-close Sessions Middleware
 * Автоматическое закрытие просроченных сессий
 * ADR-003: Session Lifecycle Management
 */

import db from '../db.js';

/**
 * Middleware для автоматического закрытия просроченных сессий
 */
export function autoCloseSessions(req, res, next) {
  try {
    const { ChatSession } = db;
    // Автоматически закрываем сессии старше 25 минут
    ChatSession.autoCloseOldSessions();
    next();
  } catch (error) {
    console.error('Error in autoCloseSessions middleware:', error);
    next(); // Продолжаем даже при ошибке
  }
}
