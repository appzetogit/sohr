import test from 'node:test';
import assert from 'node:assert/strict';
import { getStaticOtp } from './otp.staticOtp.js';

test('matches a listed number in any format', () => {
    const configured = '9876543210:1234';
    for (const phone of ['9876543210', '+91 98765 43210', '919876543210']) {
        assert.equal(getStaticOtp(phone, configured), '1234', phone);
    }
});

test('every other number gets no static OTP', () => {
    assert.equal(getStaticOtp('9876543211', '9876543210:1234'), null);
});

test('supports several numbers and a +91 prefix in the setting', () => {
    const configured = '+919876543210:1234, 9000000000:5678';
    assert.equal(getStaticOtp('9000000000', configured), '5678');
    assert.equal(getStaticOtp('9876543210', configured), '1234');
});

test('nothing configured, a missing code or a bad phone never matches', () => {
    assert.equal(getStaticOtp('9876543210', undefined), null);
    assert.equal(getStaticOtp('9876543210', ''), null);
    assert.equal(getStaticOtp('9876543210', '9876543210'), null);
    assert.equal(getStaticOtp('9876543210', '9876543210:'), null);
    assert.equal(getStaticOtp('', '9876543210:1234'), null);
    assert.equal(getStaticOtp('123', '123:1234'), null);
});
