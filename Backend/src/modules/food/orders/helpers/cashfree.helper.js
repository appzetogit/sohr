import crypto from 'crypto';
import { getPaymentGatewayCredentials } from '../../../../core/payments/paymentGatewaySettings.js';
import { ValidationError } from '../../../../core/auth/errors.js';

const API_VERSION = '2026-01-01';

// Keys come from the admin panel (Payment Gateway page), falling back to the
// CASHFREE_* environment variables. They are read on every call, so a change in the
// panel applies without restarting the server.
const creds = () => getPaymentGatewayCredentials();

const isTestAppId = (appId) => String(appId || '').startsWith('TEST');

export function isCashfreeConfigured() {
    const c = creds();
    return Boolean(c.enabled && c.appId && c.secretKey);
}

/** Mode for the browser SDK: `sandbox` for test keys, otherwise `production`. */
export function getCashfreeMode() {
    return isTestAppId(creds().appId) ? 'sandbox' : 'production';
}

async function callCashfree(path, { method = 'GET', body, appId, secretKey } = {}) {
    const c = creds();
    const id = appId || c.appId;
    const secret = secretKey || c.secretKey;
    const host = isTestAppId(id) ? 'https://sandbox.cashfree.com' : 'https://api.cashfree.com';
    const response = await fetch(`${host}/pg${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'x-api-version': API_VERSION,
            'x-client-id': id,
            'x-client-secret': secret,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { /* non-JSON error page */ }
    if (!response.ok) {
        const err = new Error(data?.message || `Cashfree request failed (${response.status})`);
        err.statusCode = response.status;
        throw err;
    }
    return data;
}

/** Webhook URL for payment events. Cashfree only accepts https, so local runs omit it. */
const notifyUrl = () => {
    const base = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
    return base.startsWith('https://') ? `${base}/api/v1/payments/webhook/cashfree` : undefined;
};

const lastTenDigits = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

/**
 * Create a Cashfree order. `purpose` and `ref` travel with the order as tags, so the
 * webhook and verification can tell who and what the money is for without trusting the
 * client. Ids may only use letters, numbers, `_` and `-`.
 */
export async function createCashfreeOrder({ orderId, amount, purpose, ref, customerId, customerPhone, customerName, customerEmail }) {
    if (!isCashfreeConfigured()) throw new ValidationError('Online payment is not set up yet');
    const phone = lastTenDigits(customerPhone);
    if (phone.length !== 10) throw new ValidationError('A 10-digit phone number is required for online payment');
    const url = notifyUrl();
    const order = await callCashfree('/orders', {
        method: 'POST',
        body: {
            order_id: orderId,
            order_amount: Math.round(Number(amount) * 100) / 100,
            order_currency: 'INR',
            customer_details: {
                customer_id: String(customerId),
                customer_phone: phone,
                ...(customerName ? { customer_name: String(customerName) } : {}),
                ...(customerEmail ? { customer_email: String(customerEmail) } : {}),
            },
            order_tags: { purpose: String(purpose), ref: String(ref) },
            ...(url ? { order_meta: { notify_url: url } } : {}),
        },
    });
    return {
        orderId: String(order.order_id),
        paymentSessionId: order.payment_session_id,
        amount: Number(order.order_amount),
        currency: order.order_currency || 'INR',
        mode: getCashfreeMode(),
    };
}

/**
 * Ask Cashfree for the real state of an order. This, not anything the browser reports,
 * decides whether money arrived and how much.
 */
export async function confirmCashfreeOrder(orderId) {
    const path = `/orders/${encodeURIComponent(String(orderId))}`;
    const order = await callCashfree(path);
    const paid = String(order?.order_status || '').toUpperCase() === 'PAID';
    let paymentId = '';
    if (paid) {
        const payments = await callCashfree(`${path}/payments`);
        const success = (Array.isArray(payments) ? payments : []).find(
            (p) => String(p?.payment_status || '').toUpperCase() === 'SUCCESS',
        );
        paymentId = success?.cf_payment_id ? String(success.cf_payment_id) : '';
    }
    return {
        paid,
        status: order?.order_status || '',
        amount: Number(order?.order_amount),
        paymentId,
        purpose: order?.order_tags?.purpose || '',
        ref: order?.order_tags?.ref || '',
    };
}

/**
 * Hosted payment link for collecting at the door. The rider app renders `link_url` as a
 * QR that the customer scans.
 */
export function createPaymentLink({ linkId, amount, description, orderId, orderMongoId, customerName, customerEmail, customerPhone, expiresAt }) {
    if (!isCashfreeConfigured()) return Promise.reject(new Error('Cashfree not configured'));
    const phone = lastTenDigits(customerPhone);
    if (phone.length !== 10) return Promise.reject(new Error('the customer has no 10-digit phone number'));
    const url = notifyUrl();
    return callCashfree('/links', {
        method: 'POST',
        body: {
            link_id: linkId,
            link_amount: Math.round(Number(amount) * 100) / 100,
            link_currency: 'INR',
            link_purpose: String(description || `Order ${orderId}`).slice(0, 500),
            customer_details: {
                customer_phone: phone,
                ...(customerName ? { customer_name: String(customerName) } : {}),
                ...(customerEmail ? { customer_email: String(customerEmail) } : {}),
            },
            link_expiry_time: expiresAt.toISOString(),
            link_notes: { orderMongoId: String(orderMongoId || ''), orderId: String(orderId || ''), purpose: 'collect_on_delivery' },
            link_notify: { send_sms: false, send_email: false },
            ...(url ? { link_meta: { notify_url: url } } : {}),
        },
    });
}

export function fetchPaymentLink(linkId) {
    return callCashfree(`/links/${encodeURIComponent(String(linkId))}`);
}

/** Cancel a payment link (rider switched to cash). */
export async function cancelPaymentLink(linkId) {
    if (!linkId || !isCashfreeConfigured()) return null;
    try {
        return await callCashfree(`/links/${encodeURIComponent(String(linkId))}/cancel`, { method: 'POST' });
    } catch {
        return null;
    }
}

/** Refund against the Cashfree order. `refundId` makes a retry safe from paying twice. */
export async function initiateCashfreeRefund(orderId, amount, refundId) {
    if (!isCashfreeConfigured()) {
        return { success: false, status: 'failed', error: 'Cashfree is not configured on this server' };
    }
    try {
        const refund = await callCashfree(`/orders/${encodeURIComponent(String(orderId))}/refunds`, {
            method: 'POST',
            body: {
                refund_id: refundId,
                refund_amount: Math.round(Number(amount) * 100) / 100,
                refund_note: 'Order cancelled',
            },
        });
        const status = String(refund?.refund_status || '').toUpperCase();
        if (['CANCELLED', 'REJECTED'].includes(status)) {
            return { success: false, status: 'failed', error: refund?.status_description || `Refund ${status.toLowerCase()}` };
        }
        return { success: true, refundId: String(refund?.cf_refund_id || refundId), status: status.toLowerCase(), raw: refund };
    } catch (err) {
        return { success: false, status: 'failed', error: err?.message || 'Cashfree refund API error' };
    }
}

/**
 * Quick credentials check for the admin panel's "Test connection" button. Looks up an
 * order that doesn't exist: 404 means the keys were accepted, 401 means they weren't.
 */
export async function testCashfreeCredentials(appId, secretKey) {
    try {
        await callCashfree('/orders/sohr_connection_test', { appId, secretKey });
    } catch (err) {
        if (err?.statusCode !== 404) throw err;
    }
    return true;
}

/** Constant-time string comparison for signatures. */
export function safeEqual(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Cashfree signs timestamp + raw body with the secret key (Base64 HMAC-SHA256). */
export function isValidWebhookSignature(rawBody, timestamp, signature, secretKey = creds().secretKey) {
    if (!rawBody || !timestamp || !signature || !secretKey) return false;
    const expected = crypto
        .createHmac('sha256', secretKey)
        .update(`${timestamp}${rawBody.toString('utf8')}`)
        .digest('base64');
    return safeEqual(expected, signature);
}
