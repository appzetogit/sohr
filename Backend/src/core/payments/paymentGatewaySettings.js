/**
 * Razorpay credentials editable from the admin panel (Payment Gateway page).
 *
 * - Secrets (key secret, webhook secret) are encrypted at rest with AES-256-GCM and
 *   never sent back to the browser; the admin only sees whether one is set.
 * - Every process (API cluster, workers) keeps an in-memory copy that refreshes every
 *   30 s and immediately in the process that saved a change, so new keys apply without
 *   a restart. Code that needs keys reads them synchronously via getRazorpayCredentials().
 * - If nothing is saved in the panel, RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET /
 *   RAZORPAY_WEBHOOK_SECRET from the environment are used.
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const settingsSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, default: 'razorpay' },
        enabled: { type: Boolean, default: false },
        keyId: { type: String, trim: true, default: '' },
        keySecretEnc: { type: String, default: '' },
        webhookSecretEnc: { type: String, default: '' },
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
    enabled: Boolean(config.razorpayKeyId && config.razorpayKeySecret),
    keyId: config.razorpayKeyId || '',
    keySecret: config.razorpayKeySecret || '',
    webhookSecret: config.razorpayWebhookSecret || '',
});

let cached = envCredentials();
let refreshTimer = null;

export async function refreshPaymentGatewaySettings() {
    try {
        if (mongoose.connection.readyState !== 1) return cached;
        const doc = await PaymentGatewaySettings.findOne({ key: 'razorpay' }).lean();
        if (!doc || (!doc.keyId && !doc.keySecretEnc)) {
            cached = envCredentials();
            return cached;
        }
        cached = {
            source: 'admin',
            enabled: Boolean(doc.enabled),
            keyId: doc.keyId || '',
            keySecret: decryptSecret(doc.keySecretEnc),
            webhookSecret: decryptSecret(doc.webhookSecretEnc),
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
 * Current Razorpay credentials. `enabled` is false when the admin switched Razorpay off
 * or no keys exist; callers must then refuse online payments.
 */
export function getRazorpayCredentials() {
    startPaymentGatewaySettingsSync();
    return cached;
}

// ---------------------------------------------------------------- admin API helpers

export const RAZORPAY_KEY_ID_RE = /^rzp_(test|live)_[A-Za-z0-9]{8,32}$/;

const mask = (keyId) => (keyId ? `${keyId.slice(0, 13)}••••${keyId.slice(-4)}` : '');

/** What the admin panel may see: never the secrets themselves. */
export async function getPaymentGatewaySettingsForAdmin() {
    const doc = await PaymentGatewaySettings.findOne({ key: 'razorpay' }).lean();
    const env = envCredentials();
    const keyId = doc?.keyId || '';
    return {
        enabled: Boolean(doc?.enabled),
        keyId,
        keyIdMasked: mask(keyId),
        mode: keyId.startsWith('rzp_live_') ? 'live' : keyId.startsWith('rzp_test_') ? 'test' : '',
        hasKeySecret: Boolean(doc?.keySecretEnc),
        hasWebhookSecret: Boolean(doc?.webhookSecretEnc),
        usingServerEnvKeys: !doc?.keyId && env.enabled,
        updatedAt: doc?.updatedAt || null,
        webhookUrl: `${String(process.env.FRONTEND_URL || 'https://sohr.in').replace(/\/$/, '')}/api/v1/payments/webhook/razorpay`,
        webhookEvents: ['qr_code.credited', 'payment_link.paid', 'payment.captured', 'refund.processed'],
    };
}

/**
 * Save from the admin panel. Blank secret fields keep the stored value, so the admin
 * can change one thing without re-typing everything.
 */
export async function savePaymentGatewaySettings({ enabled, keyId, keySecret, webhookSecret }, adminId) {
    const doc = (await PaymentGatewaySettings.findOne({ key: 'razorpay' })) || new PaymentGatewaySettings({ key: 'razorpay' });

    if (keyId !== undefined) doc.keyId = String(keyId).trim();
    if (keySecret) doc.keySecretEnc = encryptSecret(String(keySecret).trim());
    if (webhookSecret) doc.webhookSecretEnc = encryptSecret(String(webhookSecret).trim());
    if (enabled !== undefined) doc.enabled = Boolean(enabled);

    if (doc.enabled && (!doc.keyId || !doc.keySecretEnc)) {
        const err = new Error('Enter the Key ID and Key Secret before turning Razorpay on');
        err.statusCode = 400;
        throw err;
    }
    if (mongoose.isValidObjectId(adminId)) doc.updatedBy = adminId;
    await doc.save();
    await refreshPaymentGatewaySettings();
    return getPaymentGatewaySettingsForAdmin();
}
