import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOtpMessage, buildOtpSmsUrl, findMissingSmsSettings } from './otp.smsRequest.js';

const settings = {
    smsApiUrl: 'http://sms.example.test/api/mt/SendSMS',
    smsIndiaHubUsername: 'user1',
    smsIndiaHubPassword: 'p@ss&word',
    smsSenderId: 'SENDER',
    smsChannel: 'Trans',
    smsRoute: '7',
    smsPeId: '111',
    smsDltTemplateId: '222',
    smsDltTemplate: 'Welcome to ##var##, powered by ##var##. Your OTP for registration ##var##. Valid.SENDER',
    smsAppName: 'App',
    smsPoweredBy: 'Co',
};

test('fills template slots in order', () => {
    assert.equal(
        buildOtpMessage(settings, '4321'),
        'Welcome to App, powered by Co. Your OTP for registration 4321. Valid.SENDER',
    );
});

test('builds the SendSMS query with the documented param names', () => {
    const { searchParams, pathname } = buildOtpSmsUrl(settings, '9876543210', '4321');
    assert.equal(pathname, '/api/mt/SendSMS');
    assert.equal(searchParams.get('user'), 'user1');
    assert.equal(searchParams.get('password'), 'p@ss&word');
    assert.equal(searchParams.get('senderid'), 'SENDER');
    assert.equal(searchParams.get('channel'), 'Trans');
    assert.equal(searchParams.get('DCS'), '0');
    assert.equal(searchParams.get('flashsms'), '0');
    assert.equal(searchParams.get('number'), '919876543210');
    assert.match(searchParams.get('text'), /registration 4321\./);
    assert.equal(searchParams.get('DLTTemplateId'), '222');
    assert.equal(searchParams.get('route'), '7');
    assert.equal(searchParams.get('PEId'), '111');
});

test('does not double-prefix a number that already has 91', () => {
    const { searchParams } = buildOtpSmsUrl(settings, '+91 98765 43210', '4321');
    assert.equal(searchParams.get('number'), '919876543210');
});

test('leaves route out when none is configured', () => {
    const { searchParams } = buildOtpSmsUrl({ ...settings, smsRoute: undefined }, '9876543210', '4321');
    assert.equal(searchParams.has('route'), false);
});

test('reports unset settings by env var name', () => {
    assert.deepEqual(findMissingSmsSettings({ ...settings, smsRoute: undefined }), []);
    assert.deepEqual(
        findMissingSmsSettings({ ...settings, smsPeId: undefined, smsChannel: '' }),
        ['SMS_INDIA_HUB_CHANNEL', 'SMS_INDIA_HUB_PE_ID'],
    );
});
