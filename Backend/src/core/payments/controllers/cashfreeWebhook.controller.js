import { FoodOrder } from '../../../modules/food/orders/models/order.model.js';
import {
    confirmCashfreeOrder,
    isValidWebhookSignature,
} from '../../../modules/food/orders/helpers/cashfree.helper.js';
import { settleCashfreeOrderPayment } from '../../../modules/food/orders/services/order.service.js';
import { syncRazorpayQrPayment } from '../../../modules/food/orders/services/order-payment.service.js';
import { settleWalletTopup } from '../../../modules/food/user/services/userWallet.service.js';
import { settleDeliveryCashDeposit } from '../../../modules/food/delivery/services/deliveryFinance.service.js';
import { logger } from '../../../utils/logger.js';

/**
 * Cashfree payment, payment link and refund events. Recovers payments when the customer's
 * browser or app closed before it could report back. The body only says which order to
 * look at: every settle path re-reads the amount and status from Cashfree.
 */
export const handleCashfreeWebhook = async (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    if (!isValidWebhookSignature(req.rawBody, timestamp, signature)) {
        logger.warn('Cashfree Webhook: Signature verification failed.');
        return res.status(400).send('Invalid signature');
    }

    const { type, data } = req.body || {};
    logger.info(`Cashfree Webhook Received: ${type}`);

    try {
        if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
            const cfOrderId = data?.order?.order_id;
            const confirmed = cfOrderId ? await confirmCashfreeOrder(cfOrderId) : null;
            if (confirmed?.purpose === 'order') {
                const order = await settleCashfreeOrderPayment(cfOrderId);
                if (!order) {
                    logger.error(`Cashfree Webhook: PAID but no order found for ${cfOrderId}. Needs a manual refund.`);
                }
            } else if (confirmed?.purpose === 'collect') {
                const order = await FoodOrder.findOne({ 'payment.qr.qrId': cfOrderId });
                if (order) {
                    const result = await syncRazorpayQrPayment(order);
                    logger.info(`Cashfree Webhook [${type}]: order ${order.order_id || order._id} collection status = ${result?.status}`);
                } else {
                    logger.warn(`Cashfree Webhook [${type}]: no order for QR ${cfOrderId}`);
                }
            } else if (confirmed?.purpose === 'wallet') {
                await settleWalletTopup(confirmed.ref, cfOrderId);
            } else if (confirmed?.purpose === 'deposit') {
                await settleDeliveryCashDeposit(confirmed.ref, cfOrderId);
            }
        }

        if (type === 'PAYMENT_LINK_EVENT') {
            const linkId = data?.link_id;
            const order = linkId ? await FoodOrder.findOne({ 'payment.qr.paymentLinkId': linkId }) : null;
            if (order) {
                const result = await syncRazorpayQrPayment(order);
                logger.info(`Cashfree Webhook [${type}]: order ${order.order_id || order._id} collection status = ${result?.status}`);
            } else {
                logger.warn(`Cashfree Webhook [${type}]: no order for ${linkId || 'unknown id'}`);
            }
        }

        if (type === 'REFUND_STATUS_WEBHOOK') {
            const refund = data?.refund;
            if (String(refund?.refund_status || '').toUpperCase() === 'SUCCESS' && refund?.order_id) {
                await FoodOrder.updateOne(
                    { 'payment.razorpay.orderId': refund.order_id, 'payment.refund.status': { $ne: 'processed' } },
                    {
                        $set: {
                            'payment.status': 'refunded',
                            'payment.refund.status': 'processed',
                            'payment.refund.amount': Number(refund.refund_amount) || 0,
                            'payment.refund.refundId': String(refund.cf_refund_id || refund.refund_id || ''),
                            'payment.refund.processedAt': new Date(),
                        },
                    },
                );
            }
        }

        return res.status(200).json({ status: 'ok' });
    } catch (err) {
        // A 500 makes Cashfree retry, which is what a temporary failure needs.
        logger.error(`Cashfree Webhook Logic Error: ${err.message}`);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};
