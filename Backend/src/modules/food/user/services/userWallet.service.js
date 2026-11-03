import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodUserWallet } from '../models/userWallet.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { confirmCashfreeOrder, createCashfreeOrder, isCashfreeConfigured } from '../../orders/helpers/cashfree.helper.js';

const ensureWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const existing = await FoodUserWallet.findOne({ userId: oid });
    if (existing) return existing;
    return FoodUserWallet.create({ userId: oid, balance: 0, transactions: [] });
};

export const creditReferralReward = async (userId, amountInr, metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }
    const wallet = await ensureWallet(userId);
    wallet.transactions.unshift({
        type: 'addition',
        amount,
        status: 'Completed',
        description: 'Referral reward',
        metadata: { source: 'referral_reward', ...(metadata || {}) }
    });
    wallet.balance = Number(wallet.balance || 0) + amount;
    wallet.referralEarnings = Number(wallet.referralEarnings || 0) + amount;
    await wallet.save();
    return { wallet: await getUserWallet(userId) };
};

export const getUserWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const wallet = await FoodUserWallet.findOne({ userId: oid });
    if (!wallet) {
        return { balance: 0, referralEarnings: 0, transactions: [] };
    }
    // Return newest first (UI expects recent transactions on top)
    const tx = Array.isArray(wallet.transactions) ? [...wallet.transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
    return {
        balance: Number(wallet.balance) || 0,
        referralEarnings: Number(wallet.referralEarnings) || 0,
        transactions: tx.map((t) => ({
            id: String(t._id),
            _id: t._id,
            type: t.type,
            amount: Number(t.amount) || 0,
            status: t.status || 'Completed',
            description: t.description || '',
            date: t.createdAt,
            createdAt: t.createdAt,
            metadata: t.metadata || {}
        }))
    };
};

export const createWalletTopupOrder = async (userId, amountInr) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Amount must be greater than 0');
    }
    if (amount > 50000) {
        throw new ValidationError('Maximum amount is 50,000');
    }

    if (!isCashfreeConfigured()) {
        throw new ValidationError('Online payment is not set up yet');
    }

    const user = await FoodUser.findById(userId).select('name email phone').lean();
    const cashfree = await createCashfreeOrder({
        orderId: `wallet_${userId}_${Date.now().toString(36)}`,
        amount,
        purpose: 'wallet',
        ref: String(userId),
        customerId: `user_${userId}`,
        customerPhone: user?.phone,
        customerName: user?.name,
        customerEmail: user?.email
    });

    return { cashfree };
};

export const verifyWalletTopupPayment = async (userId, payload) => {
    const orderId = String(payload?.cashfreeOrderId || '').trim();
    if (!orderId) throw new ValidationError('cashfreeOrderId is required');
    return settleWalletTopup(userId, orderId);
};

/**
 * Credits the wallet with what Cashfree says was paid, once per Cashfree order. Called by
 * the client after checkout and by the webhook, in either order.
 */
export const settleWalletTopup = async (userId, orderId) => {
    if (!isCashfreeConfigured()) {
        throw new ValidationError('Online payment is not set up yet');
    }
    const confirmed = await confirmCashfreeOrder(orderId);
    if (confirmed.purpose !== 'wallet' || confirmed.ref !== String(userId)) {
        throw new ValidationError('Payment verification failed');
    }
    if (!confirmed.paid) {
        throw new ValidationError('Payment is not complete yet');
    }
    if (!Number.isFinite(confirmed.amount) || confirmed.amount <= 0) {
        throw new ValidationError('Payment verification failed');
    }

    const wallet = await ensureWallet(userId);
    await FoodUserWallet.updateOne(
        { _id: wallet._id, 'transactions.razorpayOrderId': { $ne: orderId } },
        {
            $inc: { balance: confirmed.amount },
            $push: {
                transactions: {
                    $each: [{
                        type: 'addition',
                        amount: confirmed.amount,
                        status: 'Completed',
                        description: 'Wallet top-up',
                        metadata: { source: 'wallet_topup', mode: 'cashfree' },
                        razorpayOrderId: orderId,
                        razorpayPaymentId: confirmed.paymentId
                    }],
                    $position: 0
                }
            }
        }
    );

    return { wallet: await getUserWallet(userId) };
};

export const deductWalletBalance = async (userId, amountInr, description = 'Order payment', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Invalid deduction amount');
    }

    const wallet = await ensureWallet(userId);
    if (wallet.balance < amount) {
        throw new ValidationError('Insufficient wallet balance');
    }

    wallet.transactions.unshift({
        type: 'deduction',
        amount,
        status: 'Completed',
        description,
        metadata: { source: 'order_payment', ...(metadata || {}) }
    });

    wallet.balance = Number(wallet.balance) - amount;
    await wallet.save();

    return { wallet: await getUserWallet(userId) };
};

export const refundWalletBalance = async (userId, amountInr, description = 'Order refund', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }

    const wallet = await ensureWallet(userId);
    wallet.transactions.unshift({
        type: 'refund',
        amount,
        status: 'Completed',
        description,
        metadata: { source: 'order_refund', ...(metadata || {}) }
    });

    wallet.balance = Number(wallet.balance) + amount;
    await wallet.save();

    return { wallet: await getUserWallet(userId) };
};

