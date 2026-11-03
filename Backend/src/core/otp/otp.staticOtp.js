const lastTenDigits = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

/**
 * Fixed OTP for accounts that can't receive an SMS, such as an app store reviewer's.
 * Set in OTP_STATIC_NUMBERS as comma-separated `phone:otp` pairs. Anyone who knows the
 * number and code can log in, so keep the list short and clear it after review.
 * @returns {string|null} the fixed OTP for this phone, or null if it has none
 */
export const getStaticOtp = (phone, configured) => {
    const target = lastTenDigits(phone);
    if (target.length !== 10) return null;
    for (const entry of String(configured || '').split(',')) {
        const [number, otp] = entry.split(':').map((part) => part.trim());
        if (otp && lastTenDigits(number) === target) return otp;
    }
    return null;
};
