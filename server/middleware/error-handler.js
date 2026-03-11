/**
 * Error Handler Middleware
 * Централизованная обработка ошибок
 */

/**
 * Кастомный класс ошибок приложения
 */
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

/**
 * Middleware для обработки ошибок
 */
export function errorHandler(err, req, res, next) {
  console.error('Error:', err.message, { stack: err.stack });
  
  // Если это наша кастомная ошибка
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ 
      success: false, 
      error: err.message 
    });
  }
  
  // Стандартная ошибка сервера
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
}

/**
 * Middleware для обработки 404
 */
export function notFoundHandler(req, res, next) {
  res.status(404).json({ 
    success: false, 
    error: 'Route not found' 
  });
}
