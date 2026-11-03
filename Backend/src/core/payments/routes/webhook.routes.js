import express from 'express';
import { handleCashfreeWebhook } from '../controllers/cashfreeWebhook.controller.js';

/** ✅ NEW: Webhook Routes Module */
const router = express.Router();

/**
 * Endpoint for Cashfree payment/refund events (Public)
 * Path: /api/v1/payments/webhook/cashfree
 */
router.post('/cashfree', handleCashfreeWebhook);

export default router;
