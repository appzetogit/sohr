import { z } from 'zod';
import { sendResponse, sendError } from '../../../utils/response.js';
import { logger } from '../../../utils/logger.js';
import {
    CASHFREE_APP_ID_RE,
    getPaymentGatewaySettingsForAdmin,
    getPaymentGatewayCredentials,
    refreshPaymentGatewaySettings,
    savePaymentGatewaySettings,
} from '../paymentGatewaySettings.js';
import { testCashfreeCredentials } from '../../../modules/food/orders/helpers/cashfree.helper.js';

const saveSchema = z.object({
    enabled: z.boolean().optional(),
    appId: z
        .string()
        .trim()
        .refine((v) => v === '' || CASHFREE_APP_ID_RE.test(v), 'App ID looks wrong (copy it from Cashfree Dashboard → Developers → API Keys)')
        .optional(),
    // Blank = keep the saved one.
    secretKey: z.string().trim().max(200, 'Secret Key is too long').optional(),
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
 * left blank, against Cashfree without changing anything.
 */
export async function testPaymentGatewaySettingsController(req, res) {
    const parsed = saveSchema.safeParse(req.body || {});
    if (!parsed.success) return sendError(res, 400, firstMessage(parsed));

    await refreshPaymentGatewaySettings();
    const saved = getPaymentGatewayCredentials();
    const appId = parsed.data.appId || saved.appId;
    const secretKey = parsed.data.secretKey || (appId === saved.appId ? saved.secretKey : '');
    if (!appId || !secretKey) return sendError(res, 400, 'Enter the App ID and Secret Key to test');

    try {
        await testCashfreeCredentials(appId, secretKey);
        return sendResponse(res, 200, 'Connected to Cashfree', {
            ok: true,
            mode: appId.startsWith('TEST') ? 'test' : 'live',
        });
    } catch (err) {
        return sendError(res, 400, `Cashfree said: ${err?.message || 'the keys were rejected'}`);
    }
}
