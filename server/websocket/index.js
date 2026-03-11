/**
 * WebSocket Handler
 * Обработка WebSocket соединений для чата и онлайн статуса
 */

import { Tarologist, ChatSession, Message } from '../db.js';
import { validateTelegramData } from '../middleware/auth.js';

/**
 * Инициализация WebSocket
 * @param {Object} io - Socket.IO instance
 */
export function initWebSocket(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // ========================================
    // WebSocket Online Status для тарологов
    // ========================================
    
    // Таролог подключается для отслеживания онлайн статуса
    socket.on('tarologist-connect', (data) => {
      const { tarologistId, initData } = data;
      
      // Валидация Telegram данных
      if (!validateTelegramData(initData)) {
        socket.emit('error', { message: 'Invalid Telegram data' });
        return;
      }
      
      // Проверяем, что это действительно таролог
      const params = new URLSearchParams(initData);
      const userJson = params.get('user');
      if (!userJson) {
        socket.emit('error', { message: 'No user data' });
        return;
      }
      
      const userData = JSON.parse(userJson);
      const tarologist = Tarologist.getById(tarologistId);
      
      if (!tarologist) {
        socket.emit('error', { message: 'Tarologist not found' });
        return;
      }
      
      // Проверяем, что запрос от самого таролога
      if (tarologist.telegram_id !== userData.id.toString()) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }
      
      // Сохраняем данные таролога в сокете
      socket.data.tarologistId = tarologistId;
      socket.data.userType = 'tarologist';
      
      // Обновляем WebSocket heartbeat
      Tarologist.wsHeartbeat(tarologistId);
      
      // Отправляем подтверждение и текущий статус
      const isOnline = Tarologist.isRealOnline(tarologistId);
      socket.emit('tarologist-status', {
        is_online: isOnline,
        last_ws_ping: new Date().toISOString()
      });
      
      console.log(`🔌 Таролог ${tarologistId} (${tarologist.name}) подключился через WebSocket`);
      
      // Устанавливаем интервал для heartbeat (отправляем пинг каждые 2 минуты)
      const pingInterval = setInterval(() => {
        if (socket.connected) {
          socket.emit('tarologist-ping');
        }
      }, 2 * 60 * 1000);
      
      socket.data.pingInterval = pingInterval;
    });
    
    // Таролог отвечает на ping (heartbeat)
    socket.on('tarologist-pong', () => {
      if (socket.data.tarologistId) {
        Tarologist.wsHeartbeat(socket.data.tarologistId);
        console.log(`💓 WebSocket heartbeat от таролога ${socket.data.tarologistId}`);
      }
    });
    
    // ========================================
    // WebSocket для чата
    // ========================================
    
    // Подключение к сессии чата
    socket.on('join-session', (data) => {
      const { sessionId, userId, userType } = data;
      
      socket.join(`session_${sessionId}`);
      socket.data = { ...socket.data, sessionId, userId, userType };
      
      console.log(`User ${userId} (${userType}) joined session ${sessionId}`);
      
      // Если это таролог, также обновляем его WebSocket статус
      if (userType === 'tarologist') {
        const tarologist = Tarologist.getById(userId);
        if (tarologist) {
          Tarologist.wsHeartbeat(userId);
        }
      }
      
      // Отправляем историю сообщений
      const messages = Message.getBySession(sessionId);
      socket.emit('messages-history', messages);
    });
    
    // Отправка сообщения
    socket.on('send-message', (data) => {
      const { sessionId, text, senderId, senderType } = data;
      
      // Проверяем, активна ли сессия
      const session = ChatSession.getById(sessionId);
      if (!session || !session.active) {
        socket.emit('error', { message: 'Сессия не активна' });
        return;
      }
      
      // Проверяем, не истекло ли время
      if (ChatSession.isExpired(sessionId)) {
        ChatSession.markCompleted(sessionId);
        socket.emit('session-expired');
        return;
      }
      
      // Сохраняем сообщение
      const message = Message.create({
        sessionId,
        senderId,
        senderType,
        text
      });
      
      // Рассылаем сообщение всем в сессии
      io.to(`session_${sessionId}`).emit('new-message', {
        id: message.id,
        text: message.text,
        senderId: message.sender_id,
        senderType: message.sender_type,
        timestamp: message.timestamp
      });
    });
    
    // Запрос оставшегося времени
    socket.on('get-time-left', (sessionId) => {
      const session = ChatSession.getById(sessionId);
      if (!session) {
        socket.emit('time-left', { error: 'Session not found' });
        return;
      }
      
      const startTime = new Date(session.start_time).getTime();
      const elapsed = (Date.now() - startTime) / 1000;
      const timeLeft = Math.max(0, session.duration_seconds - elapsed);
      
      socket.emit('time-left', { timeLeft, expired: timeLeft <= 0 });
    });
    
    // Отключение
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      
      // Очищаем интервал heartbeat если был установлен
      if (socket.data.pingInterval) {
        clearInterval(socket.data.pingInterval);
      }
      
      // Если это был таролог, логируем отключение
      if (socket.data.tarologistId) {
        console.log(`🔌 Таролог ${socket.data.tarologistId} отключился. Даём 5 минут на переподключение...`);
      }
    });
  });
}
