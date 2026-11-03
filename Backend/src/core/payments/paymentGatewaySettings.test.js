/**
 * Run: node --test src/core/payments/paymentGatewaySettings.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SETTINGS_ENCRYPTION_KEY = 'unit-test-key-1';
const { encryptSecret, decryptSecret, CASHFREE_APP_ID_RE } = await import('./paymentGatewaySettings.js');

test('secrets round-trip and are never stored in plain text', () => {
    const secret = 'abcDEF123secretXYZ';
    const stored = encryptSecret(secret);
    assert.ok(stored.startsWith('v1:'));
    assert.ok(!stored.includes(secret));
    assert.equal(decryptSecret(stored), secret);
    assert.notEqual(encryptSecret(secret), stored, 'a fresh IV every time');
    assert.equal(encryptSecret(''), '');
    assert.equal(decryptSecret(''), '');
});

test('a tampered value or the wrong server key is rejected', () => {
    const stored = encryptSecret('another-secret');
    const parts = stored.split(':');
    const flipped = Buffer.from(parts[3], 'base64');
    flipped[0] ^= 0xff;
    assert.throws(() => decryptSecret([parts[0], parts[1], parts[2], flipped.toString('base64')].join(':')));

    process.env.SETTINGS_ENCRYPTION_KEY = 'a-different-key';
    assert.throws(() => decryptSecret(stored));
    process.env.SETTINGS_ENCRYPTION_KEY = 'unit-test-key-1';
    assert.equal(decryptSecret(stored), 'another-secret');
});

test('Cashfree app ids are recognised', () => {
    assert.ok(CASHFREE_APP_ID_RE.test('TEST1234567890abcdef1234567890abcd'));
    assert.ok(CASHFREE_APP_ID_RE.test('1234567890abcdef1234567890abcd'));
    assert.ok(!CASHFREE_APP_ID_RE.test('rzp_test_AbCdEf1234567'));
    assert.ok(!CASHFREE_APP_ID_RE.test('TESTshort'));
});
