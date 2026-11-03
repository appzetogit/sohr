import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodDeliveryWithdrawal } from '../models/foodDeliveryWithdrawal.model.js';
import { FoodDeliveryCashDeposit } from '../models/foodDeliveryCashDeposit.model.js';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { FoodDeliveryWallet } from '../models/deliveryWallet.model.js';
import { DeliveryBonusTransaction } from '../../admin/models/deliveryBonusTransaction.model.js';
import { getDeliveryCashLimitSettings } from '../../admin/services/admin.service.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { confirmCashfreeOrder, createCashfreeOrder, isCashfreeConfigured } from '../../orders/helpers/cashfree.helper.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Enhanced wallet fetch for delivery partners.
 * Integrates:
 * 1. Historical orders (earnings)
 * 2. Admin bonuses
 * 3. Withdrawals (pending/payout)
 * 4. Cash collected vs limit
 */
export const getDeliveryPartnerWalletEnhanced = async (deliveryPartnerId) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        throw new ValidationError('Invalid delivery partner ID');
    }

    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const partner = await FoodDeliveryPartner.findById(partnerId).lean();
    if (!partner) throw new ValidationError('Delivery partner not found');

    const [cashLimitSettings, earningsAgg, cashCollectedAgg, cashDepositsAgg, bonusAgg, withdrawalAgg, withdrawalsList, depositList, walletDoc] = await Promise.all([
        getDeliveryCashLimitSettings(),
        // 1. Total Earnings from Delivered Orders
        FoodOrder.aggregate([
            { $match: { 'dispatch.deliveryPartnerId': partnerId, orderStatus: 'delivered' } },
            { $group: { _id: null, totalEarned: { $sum: { $ifNull: ['$riderEarning', 0] } } } }
        ]),
        // 2. Gross cash collected (COD orders)
        FoodOrder.aggregate([
            { 
                $match: { 
                    'dispatch.deliveryPartnerId': partnerId, 
                    orderStatus: 'delivered', 
                    'payment.method': 'cash'
                } 
            },
            { $group: { _id: null, cashCollected: { $sum: { $ifNull: ['$pricing.total', 0] } } } }
        ]),
        // 3. Cash deposits (deduct from cash-in-hand)
        FoodDeliveryCashDeposit.aggregate([
            {
                $match: {
                    deliveryPartnerId: partnerId,
                    status: 'Completed'
                }
            },
            { $group: { _id: null, depositedCash: { $sum: { $ifNull: ['$amount', 0] } } } }
        ]),
        // 4. Admin Bonuses
        DeliveryBonusTransaction.aggregate([
            { $match: { deliveryPartnerId: partnerId } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } } } }
        ]),
        // 5. Withdrawal Aggregates (Approved vs Pending)
        FoodDeliveryWithdrawal.aggregate([
            { $match: { deliveryPartnerId: partnerId } },
            { 
                $group: { 
                    _id: null, 
                    totalWithdrawn: { $sum: { $cond: [{ $in: ['$status', ['approved', 'paid']] }, '$amount', 0] } },
                    pendingWithdrawals: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } }
                } 
            }
        ]),
        // 6. Recent Withdrawals for History
        FoodDeliveryWithdrawal.find({ deliveryPartnerId: partnerId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean(),
        FoodDeliveryCashDeposit.find({ deliveryPartnerId: partnerId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean(),
        FoodDeliveryWallet.findOne({ deliveryPartnerId: partnerId }).lean()
    ]);

    const aggTotalEarned = Number(earningsAgg?.[0]?.totalEarned) || 0;
    const grossCashCollected = Number(cashCollectedAgg?.[0]?.cashCollected) || 0;
    const totalDepositedCash = Number(cashDepositsAgg?.[0]?.depositedCash) || 0;
    const computedCashInHand = Math.max(0, grossCashCollected - totalDepositedCash);
    const aggTotalBonus = Number(bonusAgg?.[0]?.total) || 0;
    const aggTotalWithdrawn = Number(withdrawalAgg?.[0]?.totalWithdrawn) || 0;
    const pendingWithdrawals = Number(withdrawalAgg?.[0]?.pendingWithdrawals) || 0;

    // Merge computed metrics with wallet ledger values to avoid stale pocket totals across admin bonus/manual wallet updates.
    const walletBalance = Number(walletDoc?.balance) || 0;
    const walletLockedAmount = Number(walletDoc?.lockedAmount) || 0;
    const walletCashInHand = Number(walletDoc?.cashInHand) || 0;
    const walletTotalEarnings = Number(walletDoc?.totalEarnings) || 0;
    const walletTotalBonus = Number(walletDoc?.totalBonus) || 0;
    const walletTotalSettled = Number(walletDoc?.totalSettled) || 0;

    const totalEarned = Math.max(aggTotalEarned, walletTotalEarnings);
    const totalBonus = Math.max(aggTotalBonus, walletTotalBonus);
    const totalWithdrawn = Math.max(aggTotalWithdrawn, walletTotalSettled);
    const cashInHand = Math.max(computedCashInHand, walletCashInHand);

    const totalCashLimit = Number(cashLimitSettings.deliveryCashLimit) || 0;
    const deliveryWithdrawalLimit = Number(cashLimitSettings.deliveryWithdrawalLimit) || 100;

    // Pocket Balance = (Earnings + Bonus) - Total Withdrawn (approved) - Pending Withdrawals.
    // Keep max with wallet ledger balance to honor admin/manual wallet adjustments.
    const computedPocketBalance = Math.max(0, (totalEarned + totalBonus) - (totalWithdrawn + pendingWithdrawals));
    const effectiveLockedAmount = Math.max(walletLockedAmount, pendingWithdrawals);
    const availableWalletBalance = Math.max(0, walletBalance - effectiveLockedAmount);
    const pocketBalance = Math.max(computedPocketBalance, availableWalletBalance);

    // Fetch transactions for UI (Orders, Bonuses, Withdrawals)
    const [ordersTx] = await Promise.all([
        FoodOrder.find({ 'dispatch.deliveryPartnerId': partnerId, orderStatus: 'delivered' })
            .sort({ createdAt: -1 })
            .select('orderId riderEarning payment orderStatus createdAt')
            .limit(20)
            .lean(),
    ]);

    const transactions = [
        ...(ordersTx || []).map(o => ({
            id: o._id,
            type: 'payment',
            amount: o.riderEarning || 0,
            status: 'Completed',
            date: o.createdAt,
            description: o.payment?.method === 'cash' ? 'COD delivery earning' : 'Online delivery earning',
            orderId: o.orderId
        })),
        ...(withdrawalsList || []).map(w => ({
            id: w._id,
            type: 'withdrawal',
            amount: w.amount,
            // Approved = checked by admin, transfer in progress; Paid = sent (UTR in transactionId).
            status: { pending: 'Pending', approved: 'Processing', paid: 'Completed' }[w.status] || 'Rejected',
            withdrawalStatus: w.status,
            transactionId: w.transactionId || '',
            rejectionReason: w.rejectionReason || '',
            date: w.createdAt,
            description: `Withdrawal Request - ${w.paymentMethod}`,
            payoutMethod: w.paymentMethod
        })),
        ...(depositList || []).map(d => ({
            id: d._id,
            type: 'deposit',
            amount: d.amount,
            status: d.status || 'Pending',
            date: d.createdAt,
            description: 'Cash limit settlement',
            paymentMethod: d.paymentMethod || 'cash',
            razorpayPaymentId: d.razorpayPaymentId || '',
            razorpayOrderId: d.razorpayOrderId || ''
        }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
        totalBalance: totalEarned + totalBonus, // Gross lifetime earnings
        pocketBalance, // Available to withdraw
        cashInHand, // COD to be deposited/deducted
        totalWithdrawn, // Actually paid out
        pendingWithdrawals, // In process
        lockedAmount: effectiveLockedAmount,
        totalEarned,
        totalBonus,
        totalCashLimit,
        availableCashLimit: Math.max(0, totalCashLimit - cashInHand),
        deliveryWithdrawalLimit,
        transactions: transactions.slice(0, 50)
    };
};

/**
 * Submits a new withdrawal request for a delivery partner.
 */
export const requestDeliveryWithdrawal = async (deliveryPartnerId, payload) => {
    const amount = Number(payload?.amount);
    const { bankDetails, paymentMethod = 'bank_transfer' } = payload;

    if (!Number.isFinite(amount) || amount < 1) throw new ValidationError('Invalid amount');

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount < wallet.deliveryWithdrawalLimit) {
        throw new ValidationError(`Minimum withdrawal amount is ₹${wallet.deliveryWithdrawalLimit}`);
    }
    if (amount > wallet.pocketBalance) {
        throw new ValidationError('Insufficient balance for this withdrawal');
    }

    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const [partner, walletDoc, pendingAgg] = await Promise.all([
        FoodDeliveryPartner.findById(deliveryPartnerId).lean(),
        FoodDeliveryWallet.findOne({ deliveryPartnerId: partnerId }),
        FoodDeliveryWithdrawal.aggregate([
            {
                $match: {
                    deliveryPartnerId: partnerId,
                    status: 'pending'
                }
            },
            {
                $group: {
                    _id: null,
                    totalPending: { $sum: { $ifNull: ['$amount', 0] } }
                }
            }
        ])
    ]);

    if (!partner) throw new ValidationError('Delivery partner not found');

    const pendingBefore = Number(pendingAgg?.[0]?.totalPending) || 0;
    const currentBalance = Number(walletDoc?.balance) || 0;
    const currentLocked = Number(walletDoc?.lockedAmount) || 0;
    const effectiveLockedBefore = Math.max(currentLocked, pendingBefore);
    const computedAvailableBalance = Number(wallet.pocketBalance) || 0;
    const targetLedgerBalance = Math.max(currentBalance, effectiveLockedBefore + computedAvailableBalance);
    const availableBalance = Math.max(0, targetLedgerBalance - effectiveLockedBefore);

    if (amount > availableBalance) {
        throw new ValidationError('Insufficient balance for this withdrawal');
    }

    const withdrawal = await FoodDeliveryWithdrawal.create({
        deliveryPartnerId: partnerId,
        amount,
        paymentMethod,
        bankDetails: bankDetails || {
            accountNumber: partner.bankAccountNumber,
            ifscCode: partner.bankIfscCode,
            bankName: partner.bankName,
            accountHolderName: partner.bankAccountHolderName
        },
        upiId: partner.upiId,
        upiQrCode: partner.upiQrCode,
        status: 'pending'
    });

    await FoodDeliveryWallet.findOneAndUpdate(
        { deliveryPartnerId: partnerId },
        {
            $set: {
                balance: targetLedgerBalance,
                lockedAmount: effectiveLockedBefore + amount
            }
        },
        { upsert: true, new: true }
    );

    return withdrawal.toObject();
};

export const createDeliveryCashDepositOrder = async (deliveryPartnerId, amountInr) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount < 1) {
        throw new ValidationError('Amount must be at least ₹1');
    }
    if (amount > 500000) {
        throw new ValidationError('Maximum deposit is ₹5,00,000');
    }

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount > wallet.cashInHand) {
        throw new ValidationError('Deposit amount cannot exceed cash in hand');
    }

    if (!isCashfreeConfigured()) {
        throw new ValidationError('Online payment is not set up yet');
    }

    const partner = await FoodDeliveryPartner.findById(deliveryPartnerId).select('name email phone').lean();
    const cashfree = await createCashfreeOrder({
        orderId: `deposit_${deliveryPartnerId}_${Date.now().toString(36)}`,
        amount,
        purpose: 'deposit',
        ref: String(deliveryPartnerId),
        customerId: `rider_${deliveryPartnerId}`,
        customerPhone: partner?.phone,
        customerName: partner?.name,
        customerEmail: partner?.email
    });
    return { cashfree };
};

export const verifyDeliveryCashDepositPayment = async (deliveryPartnerId, payload = {}) => {
    const orderId = String(payload?.cashfreeOrderId || '').trim();
    if (!orderId) throw new ValidationError('cashfreeOrderId is required');
    return settleDeliveryCashDeposit(deliveryPartnerId, orderId);
};

/**
 * Records a rider's cash deposit for what Cashfree says was paid, once per Cashfree order.
 * Called by the app after checkout and by the webhook, in either order.
 */
export const settleDeliveryCashDeposit = async (deliveryPartnerId, orderId) => {
    if (!isCashfreeConfigured()) {
        throw new ValidationError('Online payment is not set up yet');
    }
    const confirmed = await confirmCashfreeOrder(orderId);
    if (confirmed.purpose !== 'deposit' || confirmed.ref !== String(deliveryPartnerId)) {
        throw new ValidationError('Payment verification failed');
    }
    if (!confirmed.paid) {
        throw new ValidationError('Payment is not complete yet');
    }
    if (!Number.isFinite(confirmed.amount) || confirmed.amount <= 0) {
        throw new ValidationError('Could not confirm the paid amount with Cashfree');
    }

    let deposit = await FoodDeliveryCashDeposit.findOne({ razorpayOrderId: orderId }).lean();
    if (!deposit) {
        try {
            // The money has already moved, so it is recorded even if it now exceeds cash in
            // hand: refusing here would take the rider's money and show nothing for it.
            deposit = await FoodDeliveryCashDeposit.create({
                deliveryPartnerId,
                amount: confirmed.amount,
                paymentMethod: 'cashfree',
                status: 'Completed',
                razorpayOrderId: orderId,
                razorpayPaymentId: confirmed.paymentId
            });
        } catch (err) {
            if (err?.code !== 11000) throw err;
            deposit = await FoodDeliveryCashDeposit.findOne({ razorpayOrderId: orderId }).lean();
        }
    }

    return {
        deposit,
        wallet: await getDeliveryPartnerWalletEnhanced(deliveryPartnerId)
    };
};
