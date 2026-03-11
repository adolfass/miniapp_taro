/**
 * Database Module
 * SQLite база данных для Tarot Mini App
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, 'tarot.db'));

// Включаем внешние ключи
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Создаём таблицы
db.exec(`
  -- Таблица тарологов
  CREATE TABLE IF NOT EXISTS tarologists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    photo_url TEXT,
    description TEXT,
    rating REAL DEFAULT 0,
    total_ratings INTEGER DEFAULT 0,
    sessions_completed INTEGER DEFAULT 0,
    telegram_id TEXT UNIQUE,
    is_online BOOLEAN DEFAULT 0,
    last_online_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Таблица пользователей
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Таблица транзакций
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tarologist_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    stars_amount INTEGER NOT NULL,
    developer_cut INTEGER DEFAULT 0,
    tarologist_cut INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    telegram_payment_id TEXT,
    auto_refund_processed BOOLEAN DEFAULT 0,
    auto_refund_reason TEXT,
    refunded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (tarologist_id) REFERENCES tarologists(id)
  );

  -- Индекс для проверки идемпотентности (защита от двойной оплаты)
  CREATE INDEX IF NOT EXISTS idx_transactions_telegram_payment_id ON transactions(telegram_payment_id);

  -- Таблица сессий чата
  CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tarologist_id INTEGER NOT NULL,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    duration_seconds INTEGER DEFAULT 1500,
    active BOOLEAN DEFAULT 1,
    completed BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (tarologist_id) REFERENCES tarologists(id)
  );

  -- Таблица сообщений (обновлённая)
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    sender_type TEXT NOT NULL, -- 'client' | 'tarologist'
    message_type TEXT DEFAULT 'text', -- 'text' | 'photo' | 'voice' | 'video' | 'audio' | 'document'
    text TEXT,
    file_id TEXT,
    file_url TEXT,
    duration INTEGER, -- для voice/video
    telegram_message_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
  );

  -- Таблица раскладов (для отправки тарологу)
  CREATE TABLE IF NOT EXISTS spreads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tarologist_id INTEGER,
    spread_type TEXT NOT NULL, -- 'daily' | 'path'
    cards TEXT NOT NULL, -- JSON массив карт
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_sent BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (tarologist_id) REFERENCES tarologists(id)
  );

  -- Таблица выплат тарологам
  CREATE TABLE IF NOT EXISTS payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarologist_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    telegram_payment_id TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (tarologist_id) REFERENCES tarologists(id)
  );

  -- Таблица событий (для аналитики)
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT,  -- JSON: { spread_type: 'daily', amount: 48, ... }
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Индексы для производительности
  CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_tarologist ON transactions(tarologist_id);
  CREATE INDEX IF NOT EXISTS idx_chat_sessions_active ON chat_sessions(active);
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type);
  CREATE INDEX IF NOT EXISTS idx_payouts_tarologist ON payouts(tarologist_id);
  CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
  CREATE INDEX IF NOT EXISTS idx_spreads_user ON spreads(user_id);
  CREATE INDEX IF NOT EXISTS idx_spreads_sent ON spreads(is_sent);
  CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
  CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
`);

// ========================================
// Миграции - добавление новых колонок
// ========================================

// Добавляем колонки для отслеживания онлайн статуса, если их нет
try {
  db.exec(`
    ALTER TABLE tarologists ADD COLUMN is_active BOOLEAN DEFAULT 1;
  `);
  console.log('✅ Добавлена колонка is_active в tarologists');
} catch (e) {
  // Колонка уже существует
}

try {
  db.exec(`
    ALTER TABLE tarologists ADD COLUMN last_heartbeat_at DATETIME;
  `);
  console.log('✅ Добавлена колонка last_heartbeat_at в tarologists');
} catch (e) {
  // Колонка уже существует
}

try {
  db.exec(`
    ALTER TABLE tarologists ADD COLUMN last_ready_at DATETIME;
  `);
  console.log('✅ Добавлена колонка last_ready_at в tarologists');
} catch (e) {
  // Колонка уже существует
}

try {
  db.exec(`
    ALTER TABLE tarologists ADD COLUMN ready_until DATETIME;
  `);
  console.log('✅ Добавлена колонка ready_until в tarologists');
} catch (e) {
  // Колонка уже существует
}

try {
  db.exec(`
    ALTER TABLE tarologists ADD COLUMN last_ws_ping DATETIME;
  `);
  console.log('✅ Добавлена колонка last_ws_ping в tarologists');
} catch (e) {
  // Колонка уже существует
}

// Миграции для системы оценок сессий (ADR-003)
try {
  db.exec(`
    ALTER TABLE chat_sessions ADD COLUMN rated BOOLEAN DEFAULT 0;
  `);
  console.log('✅ Добавлена колонка rated в chat_sessions');
} catch (e) {
  // Колонка уже существует
}

try {
  db.exec(`
    ALTER TABLE chat_sessions ADD COLUMN rating INTEGER;
  `);
  console.log('✅ Добавлена колонка rating в chat_sessions');
} catch (e) {
  // Колонка уже существует
}

try {
  db.exec(`
    ALTER TABLE chat_sessions ADD COLUMN rating_comment TEXT;
  `);
  console.log('✅ Добавлена колонка rating_comment в chat_sessions');
} catch (e) {
  // Колонка уже существует
}

try {
  db.exec(`
    ALTER TABLE chat_sessions ADD COLUMN rated_at DATETIME;
  `);
  console.log('✅ Добавлена колонка rated_at в chat_sessions');
} catch (e) {
  // Колонка уже существует
}

// ========================================
// Модели
// ========================================

export const Tarologist = {
  // Получить ВСЕХ тарологов (для админки) - включая отключенных
  getAll() {
    const stmt = db.prepare(`
      SELECT 
        id,
        name,
        photo_url,
        description,
        rating,
        total_ratings,
        sessions_completed,
        telegram_id,
        is_online,
        last_online_at,
        is_active,
        last_heartbeat_at,
        last_ready_at,
        ready_until,
        last_ws_ping
      FROM tarologists
      ORDER BY is_active DESC, rating DESC, sessions_completed DESC
    `);

    const tarologists = stmt.all();
    const now = new Date();

    return tarologists.map(t => {
      // Вычисляем реальный статус онлайн только для активных
      const realOnline = t.is_active ? this._checkOnlineStatus(t, now) : false;
      
      // Обновляем кэшированный статус в БД если изменился (только для активных)
      if (t.is_active && t.is_online !== realOnline) {
        db.prepare('UPDATE tarologists SET is_online = ? WHERE id = ?').run(realOnline ? 1 : 0, t.id);
      }

      // В тестовом режиме цена всегда 1 звезда
      const isTestMode = process.env.TEST_MODE === 'true';
      const price = isTestMode ? 1 : calculatePrice(t.sessions_completed);
      
      return {
        ...t,
        is_online: realOnline,
        level: Math.floor(t.sessions_completed / 10) + 1,
        price: price
      };
    });
  },

  // Получить только активных тарологов (для клиентов)
  getAllActive() {
    const stmt = db.prepare(`
      SELECT 
        id,
        name,
        photo_url,
        description,
        rating,
        total_ratings,
        sessions_completed,
        telegram_id,
        is_online,
        last_online_at,
        is_active,
        last_heartbeat_at,
        last_ready_at,
        ready_until,
        last_ws_ping
      FROM tarologists
      WHERE is_active = 1
      ORDER BY rating DESC, sessions_completed DESC
    `);

    const tarologists = stmt.all();
    const now = new Date();

    return tarologists.map(t => {
      const realOnline = this._checkOnlineStatus(t, now);
      
      if (t.is_online !== realOnline) {
        db.prepare('UPDATE tarologists SET is_online = ? WHERE id = ?').run(realOnline ? 1 : 0, t.id);
      }

      // В тестовом режиме цена всегда 1 звезда
      const isTestMode = process.env.TEST_MODE === 'true';
      const price = isTestMode ? 1 : calculatePrice(t.sessions_completed);
      
      return {
        ...t,
        is_online: realOnline,
        level: Math.floor(t.sessions_completed / 10) + 1,
        price: price
      };
    });
  },

  // Внутренний метод проверки онлайн статуса
  _checkOnlineStatus(tarologist, now = new Date()) {
    // 1. Проверка WebSocket соединения (последние 5 минут)
    // WebSocket heartbeat - самый приоритетный, так как реальное соединение
    if (tarologist.last_ws_ping) {
      const wsDiff = (now - new Date(tarologist.last_ws_ping)) / 1000 / 60;
      if (wsDiff <= 5) {
        return true;
      }
    }
    
    // 2. Проверка HTTP heartbeat (устаревший метод, для обратной совместимости)
    if (tarologist.last_heartbeat_at) {
      const heartbeatDiff = (now - new Date(tarologist.last_heartbeat_at)) / 1000 / 60;
      if (heartbeatDiff <= 5) {
        return true;
      }
    }
    
    // 3. Проверка ручного подтверждения
    if (tarologist.ready_until) {
      const readyDiff = (new Date(tarologist.ready_until) - now) / 1000 / 60;
      if (readyDiff > 0) {
        return true;
      }
    }
    
    // 3. Проверка активной сессии чата
    const activeSession = db.prepare(`
      SELECT COUNT(*) as count 
      FROM chat_sessions 
      WHERE tarologist_id = ? AND active = 1
    `).get(tarologist.id);
    
    if (activeSession.count > 0) {
      return true;
    }
    
    return false;
  },

  // Получить таролога по ID
  getById(id) {
    const stmt = db.prepare('SELECT * FROM tarologists WHERE id = ?');
    const tarologist = stmt.get(id);
    
    if (!tarologist) return null;
    
    return {
      ...tarologist,
      level: Math.floor(tarologist.sessions_completed / 10) + 1,
      price: calculatePrice(tarologist.sessions_completed)
    };
  },

  // Получить таролога по Telegram ID
  getByTelegramId(telegramId) {
    const stmt = db.prepare('SELECT * FROM tarologists WHERE telegram_id = ?');
    const tarologist = stmt.get(telegramId);
    
    if (!tarologist) return null;
    
    return {
      ...tarologist,
      level: Math.floor(tarologist.sessions_completed / 10) + 1,
      price: calculatePrice(tarologist.sessions_completed)
    };
  },

  // Обновить рейтинг
  updateRating(id, rating) {
    const stmt = db.prepare(`
      UPDATE tarologists 
      SET rating = ((rating * total_ratings) + ?) / (total_ratings + 1),
          total_ratings = total_ratings + 1
      WHERE id = ?
    `);
    return stmt.run(rating, id);
  },

  // Увеличить счётчик сессий
  incrementSessions(id) {
    const stmt = db.prepare(`
      UPDATE tarologists 
      SET sessions_completed = sessions_completed + 1
      WHERE id = ?
    `);
    return stmt.run(id);
  },

  // Обновить статус онлайн
  setOnlineStatus(id, isOnline) {
    const stmt = db.prepare(`
      UPDATE tarologists 
      SET is_online = ?, last_online_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(isOnline ? 1 : 0, id);
  },

  // Отключить таролога (не удалять, а скрыть)
  disable(id) {
    const stmt = db.prepare(`
      UPDATE tarologists 
      SET is_active = 0, is_online = 0
      WHERE id = ?
    `);
    return stmt.run(id);
  },

  // Включить таролога обратно
  enable(id) {
    const stmt = db.prepare(`
      UPDATE tarologists 
      SET is_active = 1
      WHERE id = ?
    `);
    return stmt.run(id);
  },

  // Heartbeat - таролог активен (приложение открыто)
  heartbeat(id) {
    const stmt = db.prepare(`
      UPDATE tarologists 
      SET last_heartbeat_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(id);
  },

  // WebSocket heartbeat - более точный метод через WebSocket соединение
  wsHeartbeat(id) {
    const stmt = db.prepare(`
      UPDATE tarologists 
      SET last_ws_ping = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(id);
  },

  // Таролог подтвердил готовность к работе (30 минут)
  setReady(id, minutes = 30) {
    // Используем JavaScript время для консистентности с isRealOnline()
    const now = new Date();
    const readyUntil = new Date(now.getTime() + minutes * 60000);
    
    const stmt = db.prepare(`
      UPDATE tarologists 
      SET 
        last_ready_at = ?,
        ready_until = ?
      WHERE id = ?
    `);
    return stmt.run(now.toISOString(), readyUntil.toISOString(), id);
  },

  // Проверить реальный онлайн статус (комбинированная логика)
  isRealOnline(id) {
    // Получаем данные таролога
    const tarologist = this.getById(id);
    if (!tarologist || !tarologist.is_active) {
      return false;
    }

    const now = new Date();
    
    // 1. Проверка WebSocket соединения (последние 5 минут) - ПРИОРИТЕТНЫЙ
    if (tarologist.last_ws_ping) {
      const wsDiff = (now - new Date(tarologist.last_ws_ping)) / 1000 / 60; // минуты
      if (wsDiff <= 5) {
        return true;
      }
    }
    
    // 2. Проверка HTTP heartbeat (последние 5 минут) - для обратной совместимости
    if (tarologist.last_heartbeat_at) {
      const heartbeatDiff = (now - new Date(tarologist.last_heartbeat_at)) / 1000 / 60; // минуты
      if (heartbeatDiff <= 5) {
        return true;
      }
    }
    
    // 3. Проверка ручного подтверждения (ready_until не истек)
    if (tarologist.ready_until) {
      const readyDiff = (new Date(tarologist.ready_until) - now) / 1000 / 60; // минуты
      if (readyDiff > 0) {
        return true;
      }
    }
    
    // 4. Проверка активной сессии чата (ТОЛЬКО если сессия не старше 25 минут)
    const activeSession = db.prepare(`
      SELECT COUNT(*) as count 
      FROM chat_sessions 
      WHERE tarologist_id = ? 
        AND active = 1
        AND datetime(start_time, '+25 minutes') > datetime('now')
    `).get(id);
    
    if (activeSession.count > 0) {
      return true;
    }
    
    return false;
  },

  // Получить только онлайн тарологов
  getOnline() {
    const stmt = db.prepare(`
      SELECT 
        id,
        name,
        photo_url,
        description,
        rating,
        total_ratings,
        sessions_completed,
        telegram_id,
        is_online,
        last_online_at
      FROM tarologists
      WHERE is_online = 1
      ORDER BY rating DESC, sessions_completed DESC
    `);

    const tarologists = stmt.all();

    return tarologists.map(t => ({
      ...t,
      level: Math.floor(t.sessions_completed / 10) + 1,
      price: calculatePrice(t.sessions_completed)
    }));
  },

  // Создать таролога (для инициализации)
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO tarologists (name, photo_url, description, telegram_id, is_online)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(data.name, data.photo_url, data.description, data.telegram_id, data.is_online || 0);
  }
};

export const User = {
  // Найти или создать пользователя
  findOrCreate(telegramId, userData) {
    let user = this.getByTelegramId(telegramId);
    
    if (!user) {
      const stmt = db.prepare(`
        INSERT INTO users (telegram_id, username, first_name, last_name)
        VALUES (?, ?, ?, ?)
      `);
      const result = stmt.run(
        telegramId,
        userData.username || null,
        userData.first_name || null,
        userData.last_name || null
      );
      user = this.getById(result.lastInsertRowid);
    }
    
    return user;
  },

  getById(id) {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  },

  getByTelegramId(telegramId) {
    const stmt = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
    return stmt.get(telegramId);
  }
};

export const Transaction = {
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO transactions (user_id, tarologist_id, amount, stars_amount, developer_cut, tarologist_cut, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.userId,
      data.tarologistId,
      data.amount,
      data.starsAmount,
      data.developerCut,
      data.tarologistCut,
      data.status || 'pending'
    );
    return this.getById(result.lastInsertRowid);
  },

  getById(id) {
    const stmt = db.prepare(`
      SELECT t.*, u.telegram_id as user_telegram_id, tar.name as tarologist_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      JOIN tarologists tar ON t.tarologist_id = tar.id
      WHERE t.id = ?
    `);
    return stmt.get(id);
  },

  // ПРОВЕРКА ИДЕМПОТЕНТНОСТИ: Не обработан ли уже этот платёж
  getByTelegramPaymentId(telegramPaymentChargeId) {
    if (!telegramPaymentChargeId) return null;
    
    const stmt = db.prepare(`
      SELECT t.*, u.telegram_id as user_telegram_id, tar.name as tarologist_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      JOIN tarologists tar ON t.tarologist_id = tar.id
      WHERE t.telegram_payment_id = ?
    `);
    return stmt.get(telegramPaymentChargeId);
  },

  updateStatus(id, status, telegramPaymentId = null) {
    const stmt = db.prepare(`
      UPDATE transactions
      SET status = ?, telegram_payment_id = ?
      WHERE id = ?
    `);
    return stmt.run(status, telegramPaymentId, id);
  },

  // Обработать автоматический возврат
  markAutoRefunded(id, reason) {
    const stmt = db.prepare(`
      UPDATE transactions
      SET status = 'refunded', auto_refund_processed = 1, auto_refund_reason = ?, refunded_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(reason, id);
  },

  // Получить транзакции для автоматической проверки (оплаченные, но без сообщений)
  getPendingForAutoRefund(minutesThreshold = 10) {
    const stmt = db.prepare(`
      SELECT t.*, u.telegram_id as user_telegram_id, tar.name as tarologist_name,
             cs.id as session_id, cs.start_time as session_start
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      JOIN tarologists tar ON t.tarologist_id = tar.id
      LEFT JOIN chat_sessions cs ON t.user_id = cs.user_id 
        AND t.tarologist_id = cs.tarologist_id
        AND cs.start_time >= t.created_at
      WHERE t.status = 'completed'
        AND t.auto_refund_processed = 0
        AND datetime(t.created_at, '+${minutesThreshold} minutes') <= datetime('now')
    `);
    return stmt.all();
  }
};

export const ChatSession = {
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO chat_sessions (user_id, tarologist_id, duration_seconds, active)
      VALUES (?, ?, ?, 1)
    `);
    const result = stmt.run(data.userId, data.tarologistId, data.durationSeconds || 1500);
    return this.getById(result.lastInsertRowid);
  },

  getById(id) {
    const stmt = db.prepare(`
      SELECT cs.*, u.telegram_id as user_telegram_id, tar.telegram_id as tarologist_telegram_id
      FROM chat_sessions cs
      JOIN users u ON cs.user_id = u.id
      JOIN tarologists tar ON cs.tarologist_id = tar.id
      WHERE cs.id = ?
    `);
    return stmt.get(id);
  },

  getActiveByUser(userId) {
    const stmt = db.prepare(`
      SELECT * FROM chat_sessions 
      WHERE user_id = ? AND active = 1 AND completed = 0
      ORDER BY start_time DESC
      LIMIT 1
    `);
    return stmt.get(userId);
  },

  getActiveByTarologist(tarologistId) {
    const stmt = db.prepare(`
      SELECT 
        cs.*,
        u.first_name as user_name,
        u.telegram_id as user_telegram_id,
        (SELECT text FROM messages WHERE session_id = cs.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT COUNT(*) FROM messages WHERE session_id = cs.id) as message_count
      FROM chat_sessions cs
      JOIN users u ON cs.user_id = u.id
      WHERE cs.tarologist_id = ? 
        AND cs.active = 1 
        AND cs.completed = 0
      ORDER BY cs.start_time DESC
    `);
    return stmt.all(tarologistId);
  },

  markCompleted(id) {
    const stmt = db.prepare(`
      UPDATE chat_sessions 
      SET active = 0, completed = 1, end_time = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(id);
  },

  isExpired(id) {
    const session = this.getById(id);
    if (!session) return true;

    const startTime = new Date(session.start_time).getTime();
    const now = Date.now();
    const elapsed = (now - startTime) / 1000;

    return elapsed >= session.duration_seconds;
  },

  // Получить количество сообщений в сессии
  getMessageCount(id) {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE session_id = ?
    `);
    const result = stmt.get(id);
    return result ? result.count : 0;
  },

  // Проверить, есть ли сообщения в сессии (от обоих сторон)
  hasMessages(id) {
    return this.getMessageCount(id) > 0;
  },

  // Получить последнюю сессию между пользователем и тарологом
  getLastSession(userId, tarologistId) {
    const stmt = db.prepare(`
      SELECT * FROM chat_sessions
      WHERE user_id = ? AND tarologist_id = ?
      ORDER BY start_time DESC
      LIMIT 1
    `);
    return stmt.get(userId, tarologistId);
  },

  // Автоматически закрыть сессии старше 25 минут (ADR-003)
  autoCloseOldSessions() {
    const stmt = db.prepare(`
      UPDATE chat_sessions 
      SET active = 0, 
          completed = 1, 
          end_time = datetime(start_time, '+25 minutes'),
          rated = 0
      WHERE active = 1 
        AND datetime(start_time, '+25 minutes') <= datetime('now')
    `);
    const result = stmt.run();
    
    if (result.changes > 0) {
      console.log(`✅ Auto-closed ${result.changes} expired session(s)`);
    }
    
    return result.changes;
  },

  // Сохранить оценку сессии (ADR-003)
  submitRating(sessionId, rating, comment = null) {
    // Валидация
    if (!rating || rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const stmt = db.prepare(`
      UPDATE chat_sessions 
      SET rated = 1,
          rating = ?,
          rating_comment = ?,
          rated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND active = 0 AND completed = 1
    `);
    
    const result = stmt.run(rating, comment, sessionId);
    
    if (result.changes === 0) {
      throw new Error('Session not found or not completed');
    }

    // Обновляем статистику таролога
    const session = this.getById(sessionId);
    if (session) {
      const tarologistStmt = db.prepare(`
        UPDATE tarologists 
        SET rating = ((rating * total_ratings) + ?) / (total_ratings + 1),
            total_ratings = total_ratings + 1
        WHERE id = ?
      `);
      tarologistStmt.run(rating, session.tarologist_id);
    }

    return this.getById(sessionId);
  },

  // Получить сессии без оценки для таролога (для статистики)
  getUnratedSessions(tarologistId) {
    const stmt = db.prepare(`
      SELECT * FROM chat_sessions
      WHERE tarologist_id = ? 
        AND active = 0 
        AND completed = 1 
        AND rated = 0
      ORDER BY end_time DESC
    `);
    return stmt.all(tarologistId);
  },

  // Проверить, можно ли оценить сессию (только если завершена и не оценена)
  canRate(sessionId) {
    const stmt = db.prepare(`
      SELECT 
        CASE 
          WHEN active = 0 
               AND completed = 1 
               AND rated = 0 
          THEN 1 
          ELSE 0 
        END as can_rate
      FROM chat_sessions
      WHERE id = ?
    `);
    const result = stmt.get(sessionId);
    return result ? result.can_rate === 1 : false;
  }
};

export const Message = {
  // Создать текстовое сообщение
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO messages (session_id, sender_id, sender_type, text, message_type)
      VALUES (?, ?, ?, ?, 'text')
    `);
    const result = stmt.run(data.sessionId, data.senderId, data.senderType, data.text);
    return this.getById(result.lastInsertRowid);
  },

  // Создать сообщение с медиа
  createWithMedia(data) {
    const stmt = db.prepare(`
      INSERT INTO messages (session_id, sender_id, sender_type, message_type, text, file_id, file_url, duration, telegram_message_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.sessionId,
      data.senderId,
      data.senderType,
      data.messageType || 'text',
      data.text || null,
      data.fileId || null,
      data.fileUrl || null,
      data.duration || null,
      data.telegramMessageId || null
    );
    return this.getById(result.lastInsertRowid);
  },

  getById(id) {
    const stmt = db.prepare('SELECT * FROM messages WHERE id = ?');
    return stmt.get(id);
  },

  getBySession(sessionId) {
    const stmt = db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);
    return stmt.all(sessionId);
  },

  // Получить последние сообщения
  getRecent(limit = 50) {
    const stmt = db.prepare(`
      SELECT m.*, cs.user_id, cs.tarologist_id
      FROM messages m
      JOIN chat_sessions cs ON m.session_id = cs.id
      ORDER BY m.timestamp DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }
};

export const Spread = {
  // Создать расклад
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO spreads (user_id, tarologist_id, spread_type, cards)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.userId,
      data.tarologistId || null,
      data.spreadType,
      JSON.stringify(data.cards)
    );
    return this.getById(result.lastInsertRowid);
  },

  getById(id) {
    const stmt = db.prepare(`
      SELECT s.*, u.telegram_id as user_telegram_id, t.name as tarologist_name, t.telegram_id as tarologist_telegram_id
      FROM spreads s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN tarologists t ON s.tarologist_id = t.id
      WHERE s.id = ?
    `);
    return stmt.get(id);
  },

  // Получить несent расклады
  getUnsent() {
    const stmt = db.prepare(`
      SELECT s.*, u.telegram_id as user_telegram_id, t.name as tarologist_name, t.telegram_id as tarologist_telegram_id
      FROM spreads s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN tarologists t ON s.tarologist_id = t.id
      WHERE s.is_sent = 0
      ORDER BY s.created_at ASC
    `);
    return stmt.all();
  },

  // Отметить как отправленный
  markSent(id) {
    const stmt = db.prepare(`
      UPDATE spreads
      SET is_sent = 1
      WHERE id = ?
    `);
    return stmt.run(id);
  },

  // Получить расклады пользователя
  getByUser(userId) {
    const stmt = db.prepare(`
      SELECT s.*, t.name as tarologist_name
      FROM spreads s
      LEFT JOIN tarologists t ON s.tarologist_id = t.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `);
    return stmt.all(userId);
  }
};

export const Payout = {
  // Создать выплату
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO payouts (tarologist_id, amount, status, notes)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(data.tarologistId, data.amount, data.status || 'pending', data.notes || null);
    return this.getById(result.lastInsertRowid);
  },

  // Получить выплату по ID
  getById(id) {
    const stmt = db.prepare(`
      SELECT p.*, t.name as tarologist_name
      FROM payouts p
      JOIN tarologists t ON p.tarologist_id = t.id
      WHERE p.id = ?
    `);
    return stmt.get(id);
  },

  // Получить все выплаты
  getAll() {
    const stmt = db.prepare(`
      SELECT p.*, t.name as tarologist_name
      FROM payouts p
      JOIN tarologists t ON p.tarologist_id = t.id
      ORDER BY p.created_at DESC
    `);
    return stmt.all();
  },

  // Получить выплаты по статусу
  getByStatus(status) {
    const stmt = db.prepare(`
      SELECT p.*, t.name as tarologist_name
      FROM payouts p
      JOIN tarologists t ON p.tarologist_id = t.id
      WHERE p.status = ?
      ORDER BY p.created_at DESC
    `);
    return stmt.all(status);
  },

  // Отметить выплату как выполненную
  markCompleted(id) {
    const stmt = db.prepare(`
      UPDATE payouts
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(id);
  },

  // Получить баланс таролога (сумма транзакций - сумма выплат)
  getTarologistBalance(tarologistId) {
    // Сумма всех завершённых транзакций (tarologist_cut), исключая возвращенные
    const earningsStmt = db.prepare(`
      SELECT COALESCE(SUM(tarologist_cut), 0) as total
      FROM transactions
      WHERE tarologist_id = ? AND status = 'completed' AND status != 'refunded'
    `);
    const earnings = earningsStmt.get(tarologistId).total;

    // Сумма всех выплат
    const payoutsStmt = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM payouts
      WHERE tarologist_id = ? AND status = 'completed'
    `);
    const paid = payoutsStmt.get(tarologistId).total;

    return earnings - paid;
  }
};

// ========================================
// Утилиты
// ========================================

/**
 * Расчёт цены на основе количества завершённых сессий
 * @param {number} sessionsCompleted - количество завершённых сессий
 * @returns {number} цена в звёздах
 */
export function calculatePrice(sessionsCompleted) {
  // ТЕСТОВЫЙ РЕЖИМ: Если установлена TEST_PRICE, используем её
  const testPrice = process.env.TEST_PRICE;
  if (testPrice && !isNaN(parseInt(testPrice))) {
    console.log(`🧪 TEST MODE: Using test price ${testPrice} stars instead of calculated price`);
    return parseInt(testPrice);
  }
  
  const level = Math.floor(sessionsCompleted / 10) + 1;
  const price = 33 * Math.pow(1.1, level - 1);
  return Math.min(Math.round(price), 333);
}

/**
 * Инициализация тестовыми данными
 */
export function initializeTestData() {
  const count = db.prepare('SELECT COUNT(*) as count FROM tarologists').get().count;
  
  if (count === 0) {
    console.log('Инициализация тестовых данных...');
    
    Tarologist.create({
      name: 'Александра',
      photo_url: 'https://via.placeholder.com/200x200/8B5CF6/FFFFFF?text=A',
      description: 'Профессиональный таролог с 5-летним опытом. Специализируюсь на отношениях и карьере.',
      telegram_id: 'tarologist_1'
    });
    
    Tarologist.create({
      name: 'Михаил',
      photo_url: 'https://via.placeholder.com/200x200/6366F1/FFFFFF?text=M',
      description: 'Эксперт по картам Таро и астрологии. Помогу найти верный путь в сложной ситуации.',
      telegram_id: 'tarologist_2'
    });
    
    Tarologist.create({
      name: 'Елена',
      photo_url: 'https://via.placeholder.com/200x200/EC4899/FFFFFF?text=E',
      description: 'Потомственная гадалка. Работаю с Таро более 10 лет. Расклады на любую тематику.',
      telegram_id: 'tarologist_3'
    });
    
    console.log('Тестовые данные созданы');
  }
}

// ========================================
// Модель Event (для трекинга событий)
// ========================================

export const Event = {
  // Создать событие
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO events (user_id, event_type, event_data)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(
      data.userId,
      data.eventType,
      data.eventData ? JSON.stringify(data.eventData) : null
    );
    return this.getById(result.lastInsertRowid);
  },

  // Получить событие по ID
  getById(id) {
    const stmt = db.prepare('SELECT * FROM events WHERE id = ?');
    return stmt.get(id);
  },

  // Получить события пользователя
  getByUser(userId, limit = 100) {
    const stmt = db.prepare(`
      SELECT * FROM events
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(userId, limit);
  },

  // Получить события по типу
  getByType(eventType, limit = 100) {
    const stmt = db.prepare(`
      SELECT * FROM events
      WHERE event_type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(eventType, limit);
  },

  // Получить статистику по событиям (для аналитики)
  getStats(eventType, groupBy = 'day', period = 30) {
    const groupFormats = {
      'hour': '%Y-%m-%d %H:00',
      'day': '%Y-%m-%d',
      'week': '%Y-%W',
      'month': '%Y-%m'
    };
    
    const format = groupFormats[groupBy] || groupFormats.day;
    
    const stmt = db.prepare(`
      SELECT 
        strftime('${format}', created_at) as period,
        COUNT(*) as count
      FROM events
      WHERE event_type = ?
        AND created_at >= datetime('now', '-${period} days')
      GROUP BY period
      ORDER BY period ASC
    `);
    
    return stmt.all(eventType);
  }
};

export default db;
