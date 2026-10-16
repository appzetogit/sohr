import { z } from 'zod';
import { sendResponse, sendError } from '../../../utils/response.js';
import { logger } from '../../../utils/logger.js';
import {
    RAZORPAY_KEY_ID_RE,
    getPaymentGatewaySettingsForAdmin,
    getRazorpayCredentials,
    refreshPaymentGatewaySettings,
    savePaymentGatewaySettings,
} from '../paymentGatewaySettings.js';
import { testRazorpayCredentials } from '../../../modules/food/orders/helpers/razorpay.helper.js';

const saveSchema = z.object({
    enabled: z.boolean().optional(),
    keyId: z
        .string()
        .trim()
        .refine((v) => v === '' || RAZORPAY_KEY_ID_RE.test(v), 'Key ID looks wrong (it starts with rzp_test_ or rzp_live_)')
        .optional(),
    // Blank = keep the saved one.
    keySecret: z.string().trim().max(100, 'Key Secret is too long').optional(),
    webhookSecret: z.string().trim().max(200, 'Webhook secret is too long').optional(),
});

const firstMessage = (result) => result.error.errors?.[0]?.message || 'Validation failed';

export async function getPaymentGatewaySettingsController(_req, res, next) {
    try {
        return sendResponse(res, 200, 'Payment gateway settings', await getPaymentGatewaySettingsForAdmin());
    } catch (err) {
        next(err);
    }
}

export async function savePaymentGatewaySettingsController(req, res, next) {
    try {
        const parsed = saveSchema.safeParse(req.body || {});
        if (!parsed.success) return sendError(res, 400, firstMessage(parsed));
        const saved = await savePaymentGatewaySettings(parsed.data, req.user?.userId);
        logger.info(`Payment gateway settings updated by admin ${req.user?.userId} (enabled=${saved.enabled}, mode=${saved.mode})`);
        return sendResponse(res, 200, 'Payment gateway settings saved', saved);
    } catch (err) {
        if (err?.statusCode === 400) return sendError(res, 400, err.message);
        next(err);
    }
}

/**
 * "Test connection": checks the typed keys, or the saved ones when the secret field is
 * left blank, against Razorpay without changing anything.
 */
export async function testPaymentGatewaySettingsController(req, res) {
    const parsed = saveSchema.safeParse(req.body || {});
    if (!parsed.success) return sendError(res, 400, firstMessage(parsed));

    await refreshPaymentGatewaySettings();
    const saved = getRazorpayCredentials();
    const keyId = parsed.data.keyId || saved.keyId;
    const keySecret = parsed.data.keySecret || (keyId === saved.keyId ? saved.keySecret : '');
    if (!keyId || !keySecret) return sendError(res, 400, 'Enter the Key ID and Key Secret to test');

    try {
        await testRazorpayCredentials(keyId, keySecret);
        return sendResponse(res, 200, 'Connected to Razorpay', {
            ok: true,
            mode: keyId.startsWith('rzp_live_') ? 'live' : 'test',
        });
    } catch (err) {
        const reason = err?.error?.description || err?.message || 'Razorpay rejected the keys';
        return sendError(res, 400, `Razorpay said: ${reason}`);
    }
}
