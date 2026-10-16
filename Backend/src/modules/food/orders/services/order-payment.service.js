import mongoose from 'mongoose';
import { FoodOrder } from '../models/order.model.js';
import { FoodTransaction } from '../models/foodTransaction.model.js';
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
} from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import {
  cancelPaymentLink,
  closeQrCode,
  createPaymentLink,
  createUpiQrCode,
  fetchQrCodePayments,
  fetchRazorpayPaymentLink,
  isRazorpayConfigured,
} from '../helpers/razorpay.helper.js';
import * as foodTransactionService from './foodTransaction.service.js';
import {
  buildOrderIdentityFilter,
  enqueueOrderEvent,
} from './order.helpers.js';

// A collection QR stays valid this long; the rider can always generate a fresh one.
const QR_VALID_MINUTES = 30;

const toPaise = (rupees) => Math.round(Number(rupees || 0) * 100);

/**
 * Ask Razorpay whether the customer has paid the collection QR / payment link for this
 * order, and record it. Only a full, captured payment for the expected amount counts:
 * partially paid or merely authorised money must not release the food.
 */
export async function syncRazorpayQrPayment(orderDoc) {
  const orderId = orderDoc?._id;
  // FoodTransaction is source of truth; FoodOrder.payment is fallback
  const tx = await FoodTransaction.findOne({ orderId }).lean();
  const payment = tx?.payment || orderDoc?.payment || null;
  if (!payment) {
    logger.warn(`[QrSync] No payment found for order ${orderId}`);
    return null;
  }

  if (payment.method !== 'razorpay_qr') return payment;
  if (payment.status === 'paid') return payment;

  const qrId = payment?.qr?.qrId;
  const paymentLinkId = payment?.qr?.paymentLinkId;
  if (!qrId && !paymentLinkId) {
    logger.warn(`[QrSync] No QR or payment link for order ${orderId}`);
    return payment;
  }
  if (!isRazorpayConfigured()) {
    logger.warn(`[QrSync] Razorpay not configured – cannot sync order ${orderId}`);
    return payment;
  }

  const expectedPaise = toPaise(payment.amountDue);
  let isPaid = false;
  let isFailed = false;
  let qrStatus = payment?.qr?.status || 'created';
  let razorpayPaymentId = null;

  try {
    if (qrId) {
      const payments = await fetchQrCodePayments(qrId);
      const captured = payments.find(
        (p) => String(p.status).toLowerCase() === 'captured' && Number(p.amount) >= expectedPaise,
      );
      if (captured) {
        isPaid = true;
        qrStatus = 'paid';
        razorpayPaymentId = captured.id;
      } else if (payments.some((p) => String(p.status).toLowerCase() === 'captured')) {
        logger.warn(`[QrSync] Order ${orderId}: QR payment captured but below ${expectedPaise} paise — not settling.`);
      }
    } else {
      const link = await fetchRazorpayPaymentLink(paymentLinkId);
      const linkStatus = String(link?.status || '').toLowerCase();
      qrStatus = linkStatus || qrStatus;
      // Payment Link statuses: created, partially_paid, paid, expired, cancelled.
      isPaid = linkStatus === 'paid';
      isFailed = ['expired', 'cancelled', 'canceled'].includes(linkStatus);
      const linkPayment = Array.isArray(link?.payments) ? link.payments.find((p) => p?.status === 'captured') : null;
      razorpayPaymentId = linkPayment?.payment_id || null;
      if (linkStatus === 'partially_paid') {
        logger.warn(`[QrSync] Order ${orderId} link is partially paid — not settling.`);
      }
    }
  } catch (error) {
    logger.error(`[QrSync] Razorpay lookup failed for order ${orderId}: ${error?.message || error}`);
    return payment;
  }

  if (!isPaid && !isFailed) return payment;

  const set = {
    'payment.qr.status': qrStatus,
    'payment.status': isPaid ? 'paid' : 'failed',
    ...(razorpayPaymentId ? { 'payment.razorpay.paymentId': razorpayPaymentId } : {}),
  };
  logger.info(`[QrSync] Order ${orderId} collection is now '${set['payment.status']}'`);
  await Promise.all([
    FoodTransaction.updateOne({ orderId, 'payment.status': { $ne: 'paid' } }, { $set: set }),
    FoodOrder.updateOne({ _id: orderId, 'payment.status': { $ne: 'paid' } }, { $set: set }),
  ]);

  if (isPaid) {
    try {
      await foodTransactionService.updateTransactionStatus(orderId, 'cod_collect_qr_paid', {
        recordedByRole: 'SYSTEM',
        note: `Collected online via Razorpay${razorpayPaymentId ? ` (${razorpayPaymentId})` : ''}`,
      });
    } catch (err) {
      logger.warn(`[QrSync] ledger note failed for ${orderId}: ${err?.message || err}`);
    }
  }

  const updatedTx = await FoodTransaction.findOne({ orderId }).lean();
  return updatedTx?.payment || payment;
}

/**
 * Online collection at the door. Creates a single-use Razorpay UPI QR for the exact
 * amount due (paid straight into the admin's Razorpay account). If the account can't
 * create QR codes, falls back to a Razorpay payment link. Re-uses a still-open QR for the
 * same amount instead of creating duplicates.
 */
export async function createCollectQr(
  orderId,
  deliveryPartnerId,
  customerInfo = {},
) {
  const query = mongoose.Types.ObjectId.isValid(orderId)
    ? { _id: orderId }
    : { orderId };

  const order = await FoodOrder.findOne(query)
    .populate('userId', 'name email phone')
    .lean();

  if (!order) throw new NotFoundError('Order not found');
  if (
    order.dispatch.deliveryPartnerId?.toString() !== deliveryPartnerId.toString()
  ) {
    throw new ForbiddenError('Not your order');
  }
  const tx = await FoodTransaction.findOne({ orderId: order._id }).lean();
  const payment = tx?.payment || order.payment || {};
  const method = String(payment.method || '').toLowerCase();
  if (!['cash', 'razorpay_qr'].includes(method)) {
    throw new ValidationError('This order was paid online already');
  }
  if (payment.status === 'paid') {
    throw new ValidationError('Order already paid');
  }

  const amountDue = Number(payment.amountDue ?? tx?.pricing?.total ?? order.pricing?.total ?? 0);
  if (!(amountDue >= 1)) throw new ValidationError('No amount due');
  if (!isRazorpayConfigured()) {
    throw new ValidationError('Online payment is not set up yet. Ask the admin to add Razorpay keys, or collect cash.');
  }

  // Re-use an open QR / link for the same amount.
  const existing = payment.qr || {};
  const stillOpen =
    method === 'razorpay_qr' &&
    (existing.qrId || existing.paymentLinkId) &&
    toPaise(payment.amountDue) === toPaise(amountDue) &&
    (!existing.expiresAt || new Date(existing.expiresAt).getTime() > Date.now() + 60_000) &&
    !['closed', 'expired', 'cancelled', 'failed'].includes(String(existing.status || '').toLowerCase());
  if (stillOpen) {
    return {
      kind: existing.qrId ? 'upi_qr' : 'payment_link',
      shortUrl: existing.shortUrl || null,
      imageUrl: existing.imageUrl || null,
      amount: amountDue,
      expiresAt: existing.expiresAt || null,
    };
  }

  const user = order.userId || {};
  const displayId = order.order_id || order.orderId || order._id.toString();
  const closeBy = Math.floor(Date.now() / 1000) + QR_VALID_MINUTES * 60;
  const common = {
    amountPaise: toPaise(amountDue),
    description: `SOHR order ${displayId}`,
    orderId: displayId,
    orderMongoId: order._id.toString(),
  };

  let qrFields;
  let kind;
  try {
    const qr = await createUpiQrCode({ ...common, closeBy });
    kind = 'upi_qr';
    qrFields = {
      qrId: qr.id,
      imageUrl: qr.image_url,
      shortUrl: qr.image_url,
      status: qr.status || 'active',
      expiresAt: qr.close_by ? new Date(qr.close_by * 1000) : new Date(closeBy * 1000),
    };
  } catch (qrError) {
    logger.warn(
      `[CollectQr] UPI QR not available (${qrError?.error?.description || qrError?.message || qrError}); using a payment link`,
    );
    let link;
    try {
      link = await createPaymentLink({
      ...common,
      currency: 'INR',
      expireBy: closeBy,
      customerName: customerInfo.name || order.customerName || user.name || 'Customer',
      customerEmail: customerInfo.email || user.email,
      customerPhone: customerInfo.phone || order.customerPhone || user.phone,
      });
    } catch (linkError) {
      const reason = linkError?.error?.description || linkError?.message || 'unknown error';
      logger.error(`[CollectQr] Razorpay refused both QR and payment link for ${order._id}: ${reason}`);
      throw new ValidationError(`Razorpay could not create the payment (${reason}). Collect cash or ask the admin to check the Razorpay keys.`);
    }
    kind = 'payment_link';
    qrFields = {
      paymentLinkId: link.id,
      shortUrl: link.short_url,
      imageUrl: null, // the rider app renders the link as a QR itself
      status: link.status || 'created',
      expiresAt: link.expire_by ? new Date(link.expire_by * 1000) : new Date(closeBy * 1000),
    };
  }

  // CRITICAL: use upsert so this works even if FoodTransaction was never created at order placement
  await FoodTransaction.updateOne(
    { orderId: order._id },
    {
      $set: {
        paymentMethod: 'razorpay_qr',
        'payment.method': 'razorpay_qr',
        'payment.status': 'pending_qr',
        'payment.amountDue': amountDue,
        'payment.qr': qrFields,
      },
      $setOnInsert: {
        orderId: order._id,
        userId: order.userId?._id || order.userId,
        restaurantId: order.restaurantId,
        deliveryPartnerId: order.dispatch?.deliveryPartnerId,
        currency: 'INR',
        status: 'pending',
        pricing: {
          subtotal: order.pricing?.subtotal || 0,
          tax: order.pricing?.tax || 0,
          packagingFee: order.pricing?.packagingFee || 0,
          deliveryFee: order.pricing?.deliveryFee || 0,
          deliveryFeeGst: order.pricing?.deliveryFeeGst || 0,
          platformFee: order.pricing?.platformFee || 0,
          restaurantCommission: order.pricing?.restaurantCommission || 0,
          discount: order.pricing?.discount || 0,
          couponCode: order.pricing?.couponCode ? String(order.pricing.couponCode).trim().toUpperCase() : null,
          total: order.pricing?.total || 0,
          currency: 'INR',
        },
        amounts: {
          totalCustomerPaid: order.pricing?.total || 0,
          restaurantShare: 0, riderShare: 0, restaurantCommission: 0, platformNetProfit: 0,
        },
        history: [{ kind: 'created', amount: amountDue, note: 'Transaction auto-created at QR generation' }],
      },
    },
    { upsert: true },
  );

  // Also write to FoodOrder so sync and the webhook can find the QR / link
  await FoodOrder.updateOne(
    { _id: order._id },
    {
      $set: {
        'payment.method': 'razorpay_qr',
        'payment.status': 'pending_qr',
        'payment.amountDue': amountDue,
        'payment.qr': qrFields,
      },
    },
  );

  try {
    await foodTransactionService.updateTransactionStatus(order._id, 'cod_collect_qr_created', {
      recordedByRole: 'DELIVERY_PARTNER',
      recordedById: deliveryPartnerId,
      note: kind === 'upi_qr' ? 'UPI QR created for collection' : 'Payment link created for collection',
    });
  } catch (err) {
    logger.warn(`[CollectQr] ledger note failed: ${err?.message || err}`);
  }

  enqueueOrderEvent('collect_qr_created', {
    orderMongoId: order._id.toString(),
    orderId: displayId,
    deliveryPartnerId,
    qrId: qrFields.qrId || null,
    paymentLinkId: qrFields.paymentLinkId || null,
    amountDue,
  });

  return {
    kind,
    shortUrl: qrFields.shortUrl || null,
    imageUrl: qrFields.imageUrl || null,
    amount: amountDue,
    expiresAt: qrFields.expiresAt,
  };
}

export async function getPaymentStatus(orderId, deliveryPartnerId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError('Order id required');

  // Include payment field so syncRazorpayQrPayment can use it as fallback
  const order = await FoodOrder.findOne(identity).select(
    'dispatch riderEarning platformProfit payment',
  );
  if (!order) throw new NotFoundError('Order not found');
  if (
    order.dispatch?.deliveryPartnerId?.toString() !== deliveryPartnerId.toString()
  ) {
    throw new ForbiddenError('Not your order');
  }

  let transaction = await FoodTransaction.findOne({ orderId: order._id }).lean();
  const effectiveMethod = transaction?.payment?.method || order.payment?.method;
  const hasPaymentLink =
    transaction?.payment?.qr?.paymentLinkId || order.payment?.qr?.paymentLinkId ||
    transaction?.payment?.qr?.qrId || order.payment?.qr?.qrId;
  
  logger.info(`[getPaymentStatus] order=${order._id} method=${effectiveMethod} txStatus=${transaction?.payment?.status} hasLink=${!!hasPaymentLink}`);

  // Sync if this is a QR payment (check both tx and order) and not already paid
  if (effectiveMethod === 'razorpay_qr' && transaction?.payment?.status !== 'paid' && hasPaymentLink) {
    await syncRazorpayQrPayment(order);
    // Re-fetch to get the latest status after sync
    transaction = await FoodTransaction.findOne({ orderId: order._id }).lean();
    logger.info(`[getPaymentStatus] After sync: tx.payment.status=${transaction?.payment?.status}`);
  }

  // If no transaction, fall back to FoodOrder.payment
  const paymentData = transaction?.payment || order.payment?.toObject?.() || {};

  const latestHistory =
    (transaction?.history || []).sort((a, b) => (b.at || 0) - (a.at || 0))[0] ||
    null;

  return {
    payment: paymentData,
    latestPaymentSnapshot: latestHistory,
    riderEarning: order.riderEarning ?? 0,
    platformProfit: order.platformProfit ?? 0,
    pricingTotal: transaction?.pricing?.total ?? 0,
    transactionStatus: transaction?.status ?? null,
  };
}



export async function switchToCash(orderId, deliveryPartnerId) {
  const query = mongoose.Types.ObjectId.isValid(orderId)
    ? { _id: orderId }
    : { orderId };

  let order = await FoodOrder.findOne(query).lean();
  if (!order) throw new NotFoundError('Order not found');
  if (order.dispatch.deliveryPartnerId?.toString() !== deliveryPartnerId.toString()) {
    throw new ForbiddenError('Not your order');
  }

  // The local payment status is only refreshed by syncRazorpayQrPayment. Without syncing
  // first, a customer who has already scanned and paid the QR still looks unpaid here, so
  // the rider collects cash as well — the customer pays twice and the QR payment is left
  // unattributed. Pull the real state from Razorpay before deciding.
  if (order.payment?.qr?.paymentLinkId || order.payment?.qr?.qrId) {
    try {
      await syncRazorpayQrPayment(await FoodOrder.findOne(query));
      order = await FoodOrder.findOne(query).lean();
    } catch (err) {
      logger.warn(`switchToCash QR sync failed for ${order._id}: ${err?.message || err}`);
    }
  }

  // Only pay-at-delivery orders (legacy COD or QR-collect) may switch to cash.
  const orderPayMethod = String(order.payment?.method || '').toLowerCase();
  if (!['cash', 'razorpay_qr'].includes(orderPayMethod)) {
    throw new ValidationError('Online-paid orders cannot be switched to cash collection');
  }
  if (String(order.payment?.status || '').toLowerCase() === 'paid') {
    throw new ValidationError('Order is already paid');
  }

  // Stop the customer paying online as well once the rider takes cash.
  await Promise.all([closeQrCode(order.payment?.qr?.qrId), cancelPaymentLink(order.payment?.qr?.paymentLinkId)]);

  // Reset payment method to cash on BOTH records. Updating only the transaction left
  // FoodOrder.payment as razorpay_qr/pending_qr, so completeDelivery never flipped it to
  // paid and the cash-in-hand aggregations (which filter on FoodOrder.payment.method
  // 'cash' + status 'paid') never saw the money the rider actually collected.
  await Promise.all([
    FoodTransaction.updateOne(
      { orderId: order._id },
      {
        $set: {
          paymentMethod: 'cash',
          'payment.method': 'cash',
          'payment.status': 'cod_pending',
          'payment.qr': {} // Clear QR info
        }
      }
    ),
    FoodOrder.updateOne(
      { _id: order._id },
      {
        $set: {
          'payment.method': 'cash',
          'payment.status': 'cod_pending',
          'payment.qr': {}
        }
      }
    )
  ]);

  await foodTransactionService.updateTransactionStatus(
    order._id,
    'cod_switched_to_cash',
    {
      recordedByRole: 'DELIVERY_PARTNER',
      recordedById: deliveryPartnerId,
      note: 'Rider switched from QR to Cash collection',
    }
  );

  return { success: true };
}
