/**
 * Cashfree credentials editable from the admin panel (Payment Gateway page).
 *
 * - The secret key is encrypted at rest with AES-256-GCM and never sent back to the
 *   browser; the admin only sees whether one is set.
 * - Every process (API cluster, workers) keeps an in-memory copy that refreshes every
 *   30 s and immediately in the process that saved a change, so new keys apply without
 *   a restart. Code that needs keys reads them synchronously via getPaymentGatewayCredentials().
 * - If nothing is saved in the panel, CASHFREE_APP_ID / CASHFREE_SECRET_KEY from the
 *   environment are used.
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const settingsSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, default: 'cashfree' },
        enabled: { type: Boolean, default: false },
        appId: { type: String, trim: true, default: '' },
        secretKeyEnc: { type: String, default: '' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    },
    { collection: 'payment_gateway_settings', timestamps: true },
);

export const PaymentGatewaySettings =
    mongoose.models.PaymentGatewaySettings || mongoose.model('PaymentGatewaySettings', settingsSchema);

// ---------------------------------------------------------------- encryption

function encryptionKey() {
    const material = process.env.SETTINGS_ENCRYPTION_KEY || config.jwtAccessSecret || '';
    if (!material) throw new Error('No SETTINGS_ENCRYPTION_KEY configured');
    return crypto.createHash('sha256').update(`sohr-payment-settings:${material}`).digest();
}

export function encryptSecret(plain) {
    if (!plain) return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(stored) {
    if (!stored) return '';
    const [version, iv, tag, data] = String(stored).split(':');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable stored secret');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// ---------------------------------------------------------------- cache

const envCredentials = () => ({
    source: 'env',
    enabled: Boolean(config.cashfreeAppId && config.cashfreeSecretKey),
    appId: config.cashfreeAppId || '',
    secretKey: config.cashfreeSecretKey || '',
});

let cached = envCredentials();
let refreshTimer = null;

export async function refreshPaymentGatewaySettings() {
    try {
        if (mongoose.connection.readyState !== 1) return cached;
        const doc = await PaymentGatewaySettings.findOne({ key: 'cashfree' }).lean();
        if (!doc || (!doc.appId && !doc.secretKeyEnc)) {
            cached = envCredentials();
            return cached;
        }
        cached = {
            source: 'admin',
            enabled: Boolean(doc.enabled),
            appId: doc.appId || '',
            secretKey: decryptSecret(doc.secretKeyEnc),
        };
    } catch (err) {
        logger.error(`Payment gateway settings refresh failed: ${err?.message || err}`);
    }
    return cached;
}

/** Start the periodic refresh once per process (safe to call repeatedly). */
export function startPaymentGatewaySettingsSync() {
    if (refreshTimer) return;
    const tick = () => void refreshPaymentGatewaySettings();
    mongoose.connection.on('connected', tick);
    if (mongoose.connection.readyState === 1) tick();
    refreshTimer = setInterval(tick, 30_000);
    refreshTimer.unref?.();
}

/**
 * Current Cashfree credentials. `enabled` is false when the admin switched Cashfree off
 * or no keys exist; callers must then refuse online payments.
 */
export function getPaymentGatewayCredentials() {
    startPaymentGatewaySettingsSync();
    return cached;
}

// ---------------------------------------------------------------- admin API helpers

export const CASHFREE_APP_ID_RE = /^[A-Za-z0-9]{16,64}$/;

const mask = (appId) => (appId ? `${appId.slice(0, 8)}••••${appId.slice(-4)}` : '');

/** What the admin panel may see: never the secret itself. */
export async function getPaymentGatewaySettingsForAdmin() {
    const doc = await PaymentGatewaySettings.findOne({ key: 'cashfree' }).lean();
    const env = envCredentials();
    const appId = doc?.appId || '';
    const activeAppId = appId || (env.enabled ? env.appId : '');
    return {
        enabled: Boolean(doc?.enabled),
        appId,
        appIdMasked: mask(activeAppId),
        mode: activeAppId ? (activeAppId.startsWith('TEST') ? 'test' : 'live') : '',
        hasSecretKey: Boolean(doc?.secretKeyEnc),
        usingServerEnvKeys: !doc?.appId && env.enabled,
        updatedAt: doc?.updatedAt || null,
        webhookUrl: `${String(process.env.FRONTEND_URL || 'https://sohr.in').replace(/\/$/, '')}/api/v1/payments/webhook/cashfree`,
    };
}

/**
 * Save from the admin panel. A blank secret field keeps the stored value, so the admin
 * can change one thing without re-typing everything.
 */
export async function savePaymentGatewaySettings({ enabled, appId, secretKey }, adminId) {
    const doc = (await PaymentGatewaySettings.findOne({ key: 'cashfree' })) || new PaymentGatewaySettings({ key: 'cashfree' });

    if (appId !== undefined) doc.appId = String(appId).trim();
    if (secretKey) doc.secretKeyEnc = encryptSecret(String(secretKey).trim());
    if (enabled !== undefined) doc.enabled = Boolean(enabled);

    if (doc.enabled && (!doc.appId || !doc.secretKeyEnc)) {
        const err = new Error('Enter the App ID and Secret Key before turning Cashfree on');
        err.statusCode = 400;
        throw err;
    }
    if (mongoose.isValidObjectId(adminId)) doc.updatedBy = adminId;
    await doc.save();
    await refreshPaymentGatewaySettings();
    return getPaymentGatewaySettingsForAdmin();
}
