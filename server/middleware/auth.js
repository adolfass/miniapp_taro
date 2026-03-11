/**
 * Authentication Middleware
 * Валидация Telegram данных и проверка прав доступа
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
import db from '../db.js';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Валидация данных от Telegram WebApp
 * @param {string} initData - данные от Telegram
 * @returns {boolean}
 */
export function validateTelegramData(initData) {
  if (!initData) return false;
  
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();
  
  const computedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  
  return computedHash === hash;
}

/**
 * Middleware для проверки авторизации
 */
export function isAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  
  if (!validateTelegramData(initData)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  // Извлекаем пользователя
  const params = new URLSearchParams(initData);
  const userJson = params.get('user');
  
  if (userJson) {
    req.telegramUser = JSON.parse(userJson);
  }
  
  next();
}

/**
 * Middleware для проверки администратора
 */
export function isAdmin(req, res, next) {
  const telegramInitData = req.headers['x-telegram-init-data'];

  if (!telegramInitData) {
    return res.status(401).json({ success: false, error: 'No Telegram data' });
  }

  // Валидация данных Telegram
  const params = new URLSearchParams(telegramInitData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();

  const computedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) {
    return res.status(401).json({ success: false, error: 'Invalid Telegram data' });
  }

  // Проверяем, что это админ
  const userJson = params.get('user');
  if (!userJson) {
    return res.status(401).json({ success: false, error: 'No user data' });
  }

  const userData = JSON.parse(userJson);
  const adminId = process.env.ADMIN_TELEGRAM_ID;

  // Если ADMIN_TELEGRAM_ID не установлен - разрешаем первому пользователю
  if (adminId && userData.id.toString() !== adminId) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  req.adminUser = userData;
  next();
}

/**
 * Middleware для проверки таролога
 */
export async function isTarologist(req, res, next) {
  try {
    const initData = req.headers['x-telegram-init-data'];
    
    if (!initData) {
      return res.status(401).json({ success: false, error: 'No Telegram data' });
    }
    
    if (!validateTelegramData(initData)) {
      return res.status(401).json({ success: false, error: 'Invalid Telegram data' });
    }
    
    const params = new URLSearchParams(initData);
    const userJson = params.get('user');
    
    if (!userJson) {
      return res.status(401).json({ success: false, error: 'No user data' });
    }
    
    const userData = JSON.parse(userJson);
    
    // Ищем таролога по telegram_id
    const { Tarologist } = db;
    const tarologist = Tarologist.getByTelegramId(userData.id.toString());
    
    if (!tarologist) {
      return res.status(403).json({ success: false, error: 'Not a tarologist' });
    }
    
    if (!tarologist.is_active) {
      return res.status(403).json({ success: false, error: 'Tarologist is disabled' });
    }
    
    req.tarologist = tarologist;
    req.telegramUser = userData;
    next();
    
  } catch (error) {
    console.error('Tarologist auth error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
