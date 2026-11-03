/**
 * Run: node --test src/core/payments/cashfreeWebhook.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.SETTINGS_ENCRYPTION_KEY = 'unit-test-key-1';
const { isValidWebhookSignature } = await import('../../modules/food/orders/helpers/cashfree.helper.js');

const secret = 'unit-test-secret';
const body = Buffer.from('{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"order":{"order_id":"a"}}}');
const timestamp = '1762170000000';
const sign = (ts, raw, key = secret) =>
    crypto.createHmac('sha256', key).update(`${ts}${raw.toString('utf8')}`).digest('base64');

test('accepts a signature over the timestamp and raw body', () => {
    assert.equal(isValidWebhookSignature(body, timestamp, sign(timestamp, body), secret), true);
});

test('rejects a changed body, timestamp or key', () => {
    const signature = sign(timestamp, body);
    assert.equal(isValidWebhookSignature(Buffer.from(`${body} `), timestamp, signature, secret), false);
    assert.equal(isValidWebhookSignature(body, '1762170000001', signature, secret), false);
    assert.equal(isValidWebhookSignature(body, timestamp, sign(timestamp, body, 'other'), secret), false);
});

test('rejects when anything is missing', () => {
    const signature = sign(timestamp, body);
    assert.equal(isValidWebhookSignature(undefined, timestamp, signature, secret), false);
    assert.equal(isValidWebhookSignature(body, undefined, signature, secret), false);
    assert.equal(isValidWebhookSignature(body, timestamp, undefined, secret), false);
    assert.equal(isValidWebhookSignature(body, timestamp, signature, ''), false);
});
