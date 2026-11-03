const REQUIRED_SETTINGS = {
    smsIndiaHubUsername: 'SMS_INDIA_HUB_USERNAME',
    smsIndiaHubPassword: 'SMS_INDIA_HUB_PASSWORD',
    smsSenderId: 'SMS_INDIA_HUB_SENDER_ID',
    smsChannel: 'SMS_INDIA_HUB_CHANNEL',
    smsPeId: 'SMS_INDIA_HUB_PE_ID',
    smsDltTemplateId: 'SMS_INDIA_HUB_DLT_TEMPLATE_ID',
    smsDltTemplate: 'SMS_INDIA_HUB_DLT_TEMPLATE',
    smsAppName: 'SMS_INDIA_HUB_APP_NAME',
    smsPoweredBy: 'SMS_INDIA_HUB_POWERED_BY',
};

/** Names of the env vars that must be set before an OTP SMS can be sent. */
export const findMissingSmsSettings = (settings) =>
    Object.entries(REQUIRED_SETTINGS)
        .filter(([key]) => !settings[key])
        .map(([, envName]) => envName);

/** Fills the DLT template's ##var## slots in order: app name, powered by, OTP. */
export const buildOtpMessage = (settings, otp) => {
    const values = [settings.smsAppName, settings.smsPoweredBy, otp];
    return settings.smsDltTemplate.replace(/##var##/g, () => values.shift());
};

/**
 * Builds the SMS India Hub SendSMS request URL. It carries the account password,
 * so it must never be logged.
 * @param {object} settings - SMS settings from config
 * @param {string} phone - 10-digit mobile number (will be prefixed with 91)
 * @param {string} otp
 */
export const buildOtpSmsUrl = (settings, phone, otp) => {
    // Normalize phone: strip non-digits, ensure 91 country code prefix
    const digits = String(phone || '').replace(/\D/g, '');
    const number = digits.startsWith('91') ? digits : `91${digits}`;

    const url = new URL(settings.smsApiUrl);
    url.searchParams.append('user', settings.smsIndiaHubUsername);
    url.searchParams.append('password', settings.smsIndiaHubPassword);
    url.searchParams.append('senderid', settings.smsSenderId);
    url.searchParams.append('channel', settings.smsChannel);
    url.searchParams.append('DCS', '0');
    url.searchParams.append('flashsms', '0');
    url.searchParams.append('number', number);
    url.searchParams.append('text', buildOtpMessage(settings, otp));
    url.searchParams.append('DLTTemplateId', settings.smsDltTemplateId);
    if (settings.smsRoute) {
        url.searchParams.append('route', settings.smsRoute);
    }
    url.searchParams.append('PEId', settings.smsPeId);
    return url;
};
