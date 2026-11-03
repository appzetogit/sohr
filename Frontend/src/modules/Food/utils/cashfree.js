/**
 * Cashfree Payment Integration Utility
 * Opens Cashfree checkout. Whether money arrived is decided by the backend, which asks
 * Cashfree directly, so callers must verify with the backend after `handler` fires.
 */

const SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";

let sdkPromise = null;

/**
 * Load Cashfree checkout script
 */
export const loadCashfreeScript = () => {
  if (window.Cashfree) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;

    // Add timeout to prevent freeze
    const timeout = setTimeout(() => {
      sdkPromise = null;
      reject(new Error("Cashfree script load timeout"));
    }, 10000);

    script.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timeout);
      sdkPromise = null;
      reject(new Error("Failed to load Cashfree script"));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
};

/**
 * Open Cashfree checkout
 * @param {Object} options - Payment options
 * @param {String} options.paymentSessionId - From the backend's create-order response
 * @param {String} options.mode - "sandbox" or "production", from the same response
 * @param {Function} options.handler - Checkout finished; verify with the backend
 * @param {Function} options.onError - The checkout could not open
 * @param {Function} options.onClose - Closed without finishing, or the payment failed
 */
export const initCashfreePayment = async ({ paymentSessionId, mode, handler, onError, onClose }) => {
  try {
    await loadCashfreeScript();

    if (!window.Cashfree) {
      throw new Error("Cashfree SDK not available");
    }

    const cashfree = window.Cashfree({ mode });
    const result = await cashfree.checkout({ paymentSessionId, redirectTarget: "_modal" });

    if (result?.paymentDetails) {
      await handler?.(result.paymentDetails);
    } else {
      // Cashfree reports "closed" and "failed" the same way, and the customer has already
      // seen any failure inside the checkout window.
      await onClose?.(result?.error);
    }
  } catch (error) {
    console.error("Error initializing Cashfree:", error);
    onError?.(error);
  }
};
