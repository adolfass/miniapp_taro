/**
 * Database Module
 * SQLite база данных для Tarot Mini App
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (tarologist_id) REFERENCES tarologists(id)
  );

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
`);

// ========================================
// Модели
// ========================================

export const Tarologist = {
  // Получить всех тарологов с рассчитанной ценой
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
        telegram_id
      FROM tarologists
      ORDER BY rating DESC, sessions_completed DESC
    `);
    
    const tarologists = stmt.all();
    
    return tarologists.map(t => ({
      ...t,
      level: Math.floor(t.sessions_completed / 10) + 1,
      price: calculatePrice(t.sessions_completed)
    }));
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

  // Создать таролога (для инициализации)
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO tarologists (name, photo_url, description, telegram_id)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(data.name, data.photo_url, data.description, data.telegram_id);
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

  updateStatus(id, status, telegramPaymentId = null) {
    const stmt = db.prepare(`
      UPDATE transactions 
      SET status = ?, telegram_payment_id = ?
      WHERE id = ?
    `);
    return stmt.run(status, telegramPaymentId, id);
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
    // Сумма всех завершённых транзакций (tarologist_cut)
    const earningsStmt = db.prepare(`
      SELECT COALESCE(SUM(tarologist_cut), 0) as total
      FROM transactions
      WHERE tarologist_id = ? AND status = 'completed'
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

export default db;
