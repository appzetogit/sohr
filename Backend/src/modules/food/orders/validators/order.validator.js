import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

const orderItemSchema = z.object({
    itemId: z.string().min(1, 'Item id required'),
    name: z.string().min(1, 'Item name required'),
    variantId: z.string().optional(),
    variantName: z.string().optional(),
    variantPrice: z.number().min(0).optional(),
    price: z.number().min(0),
    otherPrice: z.number().min(0).optional(),
    quantity: z.number().int().min(1),
    isVeg: z.boolean().optional().default(true),
    image: z.string().optional(),
    notes: z.string().optional(),
    /**
     * Add-ons chosen for this line.
     *
     * Zod strips keys it does not declare, so omitting this discarded the
     * customer's add-ons before any pricing code could see them — the reason
     * they were never billed and never appeared on the order.
     *
     * Ids or names, as strings or objects, because the shipped apps send names
     * while a corrected client sends ids. Nothing here is trusted for price:
     * resolveOrderCartItems looks each one up against the restaurant's
     * published add-ons and ignores anything it cannot identify.
     */
    addons: z
        .array(
            z.union([
                z.string(),
                z.object({
                    addonId: z.string().optional(),
                    id: z.string().optional(),
                    name: z.string().optional()
                })
            ])
        )
        .optional()
});

const addressSchema = z.object({
    label: z.enum(['Home', 'Office', 'Other']).optional(),
    name: z.string().optional(),
    fullName: z.string().optional(),
    street: z.string().min(1, 'Street required'),
    additionalDetails: z.string().optional(),
    city: z.string().min(1, 'City required'),
    state: z.string().min(1, 'State required'),
    zipCode: z.string().optional(),
    phone: z.string().optional(),
    location: z
        .object({
            type: z.literal('Point').optional(),
            coordinates: z.tuple([z.number(), z.number()]).optional()
        })
        .optional()
});

const pricingSchema = z.object({
    subtotal: z.number().min(0),
    tax: z.number().min(0).optional(),
    packagingFee: z.number().min(0).optional(),
    deliveryFee: z.number().min(0).optional(),
    platformFee: z.number().min(0).optional(),
    discount: z.number().min(0).optional(),
    total: z.number().min(0),
    currency: z.string().optional(),
    couponCode: z.string().nullable().optional()
});

export function validateCalculateOrderDto(body) {
    const schema = z.object({
        items: z.array(orderItemSchema).min(1, 'At least one item required'),
        restaurantId: z.string().min(1, 'Restaurant id required'),
        deliveryAddressId: z.string().optional(),
        zoneId: z.string().optional(),
        couponCode: z.string().optional(),
        deliveryFleet: z.string().optional(),
        deliveryMode: z.enum(['basic', 'quick']).optional(),
        deliveryAddress: z
            .object({
                location: z
                    .object({
                        coordinates: z.tuple([z.number(), z.number()]).optional()
                    })
                    .optional()
            })
            .passthrough()
            .optional(),
        scheduledAt: z.string().datetime().optional()
    });
    const result = schema.safeParse(body);
    if (!result.success) {
        const first = result.error.issues?.[0];
        const path = first?.path?.length ? first.path.join('.') : '';
        const msg = path ? `${path}: ${first?.message || 'Validation failed'}` : first?.message || 'Validation failed';
        throw new ValidationError(msg);
    }
    return result.data;
}

export function validateCreateOrderDto(body) {
    const schema = z.object({
        items: z.array(orderItemSchema).min(1, 'At least one item required'),
        address: addressSchema,
        restaurantId: z.string().min(1, 'Restaurant id required'),
        restaurantName: z.string().optional(),
        customerName: z.string().optional(),
        customerPhone: z.string().optional(),
        pricing: pricingSchema,
        deliveryFleet: z.string().optional(),
        note: z.string().optional(),
        deliveryInstructions: z.string().optional(),
        deliveryMode: z.enum(['basic', 'quick']).optional(),
        sendCutlery: z.boolean().optional(),
        // 'cash' is true COD, collected as notes at the door.
        // 'razorpay_qr' is the same pay-at-delivery flow, collected by QR instead.
        // 'cash' is accepted here regardless so the service can return the friendly
        // "not available" message when COD_ENABLED is off, rather than a generic
        // enum error that names every method.
        paymentMethod: z.enum(['razorpay', 'razorpay_qr', 'card', 'wallet', 'cash'], {
            errorMap: () => ({ message: 'Unsupported payment method' }),
        }),
        zoneId: z.string().nullable().optional(),
        scheduledAt: z.string().datetime().optional()
    });
    const result = schema.safeParse(body);
    if (!result.success) {
        const msg = result.error.errors?.[0]?.message || 'Validation failed';
        throw new ValidationError(msg);
    }
    return result.data;
}

export function validateVerifyPaymentDto(body) {
    const schema = z.object({
        orderId: z.string().min(1, 'Order id required'),
        razorpayOrderId: z.string().min(1, 'Razorpay order id required'),
        razorpayPaymentId: z.string().min(1, 'Razorpay payment id required'),
        razorpaySignature: z.string().min(1, 'Razorpay signature required')
    });
    const result = schema.safeParse(body);
    if (!result.success) {
        const msg = result.error.errors?.[0]?.message || 'Validation failed';
        throw new ValidationError(msg);
    }
    return result.data;
}

export function validateCancelOrderDto(body) {
    const schema = z.object({
        reason: z.string().optional()
    });
    const result = schema.safeParse(body || {});
    if (!result.success) {
        throw new ValidationError(result.error.errors?.[0]?.message || 'Validation failed');
    }
    return result.data;
}

export function validateOrderStatusDto(body) {
    const schema = z.object({
        orderStatus: z.enum([
            'confirmed',
            'preparing',
            'ready_for_pickup',
            'picked_up',
            'delivered',
            'cancelled_by_restaurant'
        ]),
        note: z.string().optional()
    });
    const result = schema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors?.[0]?.message || 'Validation failed');
    }
    return result.data;
}

/** Payment methods an admin can record for an order taken over WhatsApp. */
const manualPaymentMethod = z.enum(['cash', 'razorpay', 'razorpay_qr', 'wallet']);

/**
 * Corrections the admin makes on the Assign dialog before the rider is offered the
 * order. Every field is optional — an untouched field must leave the order as it is.
 */
const assignOrderDetailsSchema = z.object({
    customerName: z.string().optional(),
    customerPhone: z.string().optional(),
    address: z
        .object({
            street: z.string().optional(),
            additionalDetails: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            zipCode: z.string().optional(),
            latitude: z.union([z.number(), z.string()]).optional(),
            longitude: z.union([z.number(), z.string()]).optional()
        })
        .optional(),
    amount: z.union([z.number(), z.string()]).optional(),
    paymentMethod: manualPaymentMethod.optional(),
    riderEarning: z.union([z.number(), z.string()]).optional(),
    note: z.string().optional(),
    deliveryInstructions: z.string().optional()
});

export function validateAssignDeliveryDto(body) {
    const schema = z.object({
        deliveryPartnerId: z.string().min(1, 'Delivery partner id required'),
        orderDetails: assignOrderDetailsSchema.optional()
    });
    const result = schema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors?.[0]?.message || 'Validation failed');
    }
    return result.data;
}

// Indian mobile: 10 digits starting 6-9, with an optional +91 / 91 / 0 prefix.
// Spaces, dashes and brackets are stripped first; the stored value is the 10 digits.
export function normalizeIndianMobile(value) {
    const digits = String(value ?? '').replace(/[\s\-().]/g, '').replace(/^\+/, '');
    const local = digits.replace(/^(?:0{0,2}91|0)(?=[6-9]\d{9}$)/, '');
    return /^[6-9]\d{9}$/.test(local) ? local : null;
}

const trimmed = (min, max, label) =>
    z.preprocess(
        (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v),
        z
            .string({ required_error: `${label} is required`, invalid_type_error: `${label} is required` })
            .min(min, min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
            .max(max, `${label} must be at most ${max} characters`),
    );

// A person or place name: letters (any script), spaces and . ' - only.
const nameLike = (min, max, label) =>
    trimmed(min, max, label).refine((v) => /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(v), {
        message: `${label} can only contain letters, spaces and . ' -`,
    });

const manualLineItem = z.object({
    // Menu item id; omitted for a custom item typed in by the admin.
    itemId: z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid menu item').optional(),
    name: trimmed(1, 120, 'Item name'),
    quantity: z.coerce
        .number({ invalid_type_error: 'Quantity must be a number' })
        .int('Quantity must be a whole number')
        .min(1, 'Quantity must be at least 1')
        .max(99, 'Quantity can be at most 99'),
    // Unit price. Menu items are re-priced from the menu on the server.
    price: z.coerce
        .number({ invalid_type_error: 'Item price must be a number' })
        .min(0, 'Item price cannot be negative')
        .max(100000, 'Item price is too large'),
});

export function validateManualOrderDto(body) {
    const schema = z
        .object({
            restaurantId: z.string().trim().min(1, 'Pickup restaurant required'),
            customerName: nameLike(2, 80, 'Customer name'),
            customerPhone: z
                .string({ required_error: 'Customer phone required' })
                .transform((v, ctx) => {
                    const phone = normalizeIndianMobile(v);
                    if (!phone) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: 'Enter a valid 10-digit Indian mobile number',
                        });
                        return z.NEVER;
                    }
                    return phone;
                }),
            address: z.object(
                {
                    street: trimmed(5, 200, 'Delivery address'),
                    additionalDetails: z.string().trim().max(200).optional(),
                    city: nameLike(2, 60, 'City'),
                    state: nameLike(2, 60, 'State'),
                    zipCode: z
                        .string()
                        .trim()
                        .refine((v) => v === '' || /^[1-9]\d{5}$/.test(v), 'Pin code must be 6 digits')
                        .optional(),
                    latitude: z.union([z.number(), z.string()]).optional(),
                    longitude: z.union([z.number(), z.string()]).optional(),
                },
                { required_error: 'Delivery address required' },
            ),
            // Itemised lines (preferred). `items` is the older free-text form.
            lineItems: z
                .array(manualLineItem)
                .min(1, 'Add at least one item')
                .max(50, 'An order can have at most 50 items')
                .optional(),
            items: z.string().trim().max(1000).optional(),
            amount: z.coerce
                .number({ invalid_type_error: 'Order amount required' })
                .positive('Order amount must be more than 0')
                .max(100000, 'Order amount is too large'),
            paymentMethod: manualPaymentMethod.default('cash'),
            riderEarning: z.coerce
                .number()
                .min(0, 'Rider payout cannot be negative')
                .max(5000, 'Rider payout is too large')
                .optional(),
            note: z.string().trim().max(500).optional(),
            deliveryInstructions: z.string().trim().max(300, 'Rider instructions must be at most 300 characters').optional(),
            // Optional: assign a rider in the same request (they may already be on a trip).
            deliveryPartnerId: z
                .string()
                .trim()
                .regex(/^[a-f\d]{24}$/i, 'Invalid delivery partner')
                .optional(),
        })
        .refine((d) => (d.lineItems && d.lineItems.length) || (d.items && d.items.length), {
            message: 'Order items required',
            path: ['lineItems'],
        });
    const result = schema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors?.[0]?.message || 'Validation failed');
    }
    return result.data;
}

export function validateDispatchSettingsDto(body) {
    const schema = z.object({
        dispatchMode: z.enum(['auto', 'manual'])
    });
    const result = schema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors?.[0]?.message || 'Validation failed');
    }
    return result.data;
}

export function validateOrderRatingsDto(body) {
    const schema = z.object({
        restaurantRating: z.number().min(1).max(5),
        deliveryPartnerRating: z.number().min(1).max(5).optional(),
        restaurantComment: z.string().max(500).optional(),
        deliveryPartnerComment: z.string().max(500).optional(),
        // Per-dish ratings. Optional, so a customer can rate the restaurant
        // without being forced to score every item.
        itemRatings: z
            .array(
                z.object({
                    itemId: z.string().min(1),
                    rating: z.number().min(1).max(5),
                    comment: z.string().max(500).optional()
                })
            )
            .max(50)
            .optional()
    });
    const result = schema.safeParse(body || {});
    if (!result.success) {
        throw new ValidationError(result.error.errors?.[0]?.message || 'Validation failed');
    }
    return result.data;
}

/** Delivery partner rating the customer after handover. */
export function validateCustomerRatingDto(body) {
    const schema = z.object({
        rating: z.number().min(1).max(5),
        comment: z.string().max(500).optional()
    });
    const result = schema.safeParse(body || {});
    if (!result.success) {
        throw new ValidationError(result.error.errors?.[0]?.message || 'Validation failed');
    }
    return result.data;
}
