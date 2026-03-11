/**
 * Main API Router
 * Объединение всех API роутов
 */

import express from 'express';
import tarologistsRouter from './tarologists.js';
import paymentsRouter from './payments.js';
import chatRouter from './chat.js';
import adminRouter from './admin.js';

const router = express.Router();

// Public routes
router.use('/tarologists', tarologistsRouter);
router.use('/payment', paymentsRouter);
router.use('/chat', chatRouter);
router.use('/admin', adminRouter);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
