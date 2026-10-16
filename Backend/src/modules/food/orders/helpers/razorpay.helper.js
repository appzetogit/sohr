import crypto from 'crypto';

let Razorpay;
try {
    const mod = await import('razorpay');
    Razorpay = mod.default;
} catch {
    Razorpay = null;
}

import { getRazorpayCredentials } from '../../../../core/payments/paymentGatewaySettings.js';

// Keys come from the admin panel (Payment Gateway page), falling back to the
// RAZORPAY_* environment variables. They are read on every call, so a change in the
// panel applies without restarting the server.
const creds = () => getRazorpayCredentials();

export function isRazorpayConfigured() {
    const c = creds();
    return Boolean(c.enabled && c.keyId && c.keySecret && Razorpay);
}

export function getRazorpayKeyId() {
    return creds().keyId || '';
}

export function getRazorpayInstance() {
    if (!isRazorpayConfigured()) return null;
    const c = creds();
    return new Razorpay({ key_id: c.keyId, key_secret: c.keySecret });
}

export function createRazorpayOrder(amountPaise, currency = 'INR', receipt = '') {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    return instance.orders.create({
        amount: Math.round(amountPaise),
        currency,
        receipt: receipt || undefined
    });
}

export function createPaymentLink({ amountPaise, currency = 'INR', description, orderId, orderMongoId, customerName, customerEmail, customerPhone, expireBy }) {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    const contact = customerPhone ? String(customerPhone).replace(/\D/g, '').slice(-10) : '';
    return instance.paymentLink.create({
        amount: Math.round(amountPaise),
        currency,
        description: description || `Order ${orderId}`,
        // Lets the webhook and the Razorpay dashboard trace the payment to the order.
        reference_id: orderMongoId ? `${String(orderMongoId)}-${Date.now().toString(36)}` : undefined,
        notes: { orderMongoId: String(orderMongoId || ''), orderId: String(orderId || ''), purpose: 'collect_on_delivery' },
        ...(expireBy ? { expire_by: expireBy } : {}),
        customer: {
            name: customerName || 'Customer',
            ...(customerEmail ? { email: customerEmail } : {}),
            ...(contact.length === 10 ? { contact } : {}),
        },
        notify: { sms: false, email: false },
    });
}

/**
 * Single-use UPI QR for exactly this amount (Razorpay QR Codes API). The customer scans
 * it with any UPI app and the money goes to the admin's Razorpay account. Needs the QR
 * Codes product on the Razorpay account; callers fall back to a payment link otherwise.
 */
export function createUpiQrCode({ amountPaise, description, orderId, orderMongoId, closeBy }) {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    return instance.qrCode.create({
        type: 'upi_qr',
        name: 'SOHR',
        usage: 'single_use',
        fixed_amount: true,
        payment_amount: Math.round(amountPaise),
        description: (description || `Order ${orderId}`).slice(0, 255),
        ...(closeBy ? { close_by: closeBy } : {}),
        notes: { orderMongoId: String(orderMongoId || ''), orderId: String(orderId || ''), purpose: 'collect_on_delivery' },
    });
}

/** Payments received on a QR code (newest first). */
export async function fetchQrCodePayments(qrId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    const res = await instance.qrCode.fetchAllPayments(String(qrId), { count: 10 });
    return Array.isArray(res?.items) ? res.items : [];
}

/** Close a QR code so it can't be paid again (e.g. rider switched to cash). */
export async function closeQrCode(qrId) {
    const instance = getRazorpayInstance();
    if (!instance || !qrId) return null;
    try {
        return await instance.qrCode.close(String(qrId));
    } catch {
        return null;
    }
}

/** Cancel a payment link (rider switched to cash). */
export async function cancelPaymentLink(paymentLinkId) {
    const instance = getRazorpayInstance();
    if (!instance || !paymentLinkId) return null;
    try {
        return await instance.paymentLink.cancel(String(paymentLinkId));
    } catch {
        return null;
    }
}

/** Quick credentials check for the admin panel's "Test connection" button. */
export async function testRazorpayCredentials(keyId, keySecret) {
    if (!Razorpay) throw new Error('Razorpay SDK not installed on the server');
    const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
    await instance.orders.all({ count: 1 });
    return true;
}

export function verifyPaymentSignature(orderId, paymentId, signature) {
    const secret = creds().keySecret;
    if (!secret || !signature) return false;
    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return safeEqual(expected, String(signature));
}

/** Constant-time string comparison for signatures. */
export function safeEqual(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Webhook secret currently in effect (admin panel, else RAZORPAY_WEBHOOK_SECRET). */
export function getRazorpayWebhookSecret() {
    return creds().webhookSecret || '';
}

/**
 * Fetch Razorpay payment (server-side) for additional validation (amount/status/order match).
 * @param {string} paymentId
 */
export async function fetchRazorpayPayment(paymentId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentId) throw new Error('paymentId is required');
    return instance.payments.fetch(String(paymentId));
}

/**
 * Fetch Razorpay payment-link to check status (used for Razorpay QR auto verification).
 * @param {string} paymentLinkId
 */
export async function fetchRazorpayPaymentLink(paymentLinkId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentLinkId) throw new Error('paymentLinkId is required');
    return instance.paymentLink.fetch(String(paymentLinkId));
}

/**
 * ✅ NEW: Initiate a refund for a successful payment.
 * NON-BREAKING Extension for automated cancellation refunds.
 * @param {string} paymentId - Original Razorpay payment_id (captured)
 * @param {number} amount - Amount to refund (in major unit, e.g., INR 123.45)
 */
export async function initiateRazorpayRefund(paymentId, amount) {
    if (!isRazorpayConfigured()) {
        throw new Error('Razorpay is not configured on this server');
    }
    const instance = getRazorpayInstance();
    try {
        const refund = await instance.payments.refund(paymentId, {
            amount: Math.round(Number(amount) * 100), // convert to paise
            notes: {
                reason: 'Order cancelled by system flow',
                at: new Date().toISOString()
            }
        });
        return {
            success: true,
            refundId: refund.id,
            status: refund.status || 'processed',
            raw: refund
        };
    } catch (err) {
        // Log locally but pass the error to the service to handle status update
        console.error(`Razorpay Refund API Failure [PaymentId: ${paymentId}]:`, err?.message || err);
        return {
            success: false,
            error: err?.message || 'Razorpay refund API error',
            status: 'failed'
        };
    }
}
