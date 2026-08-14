/**
 * Trust-boundary checks for the two admin-typed order payloads.
 *
 * Run: node --test src/modules/food/orders/validators/order.validator.test.js
 *
 * These DTOs are the only thing standing between a hand-typed WhatsApp order and a
 * saved FoodOrder — the schema below them requires an address, a total and a payment
 * method, so anything this lets through with a hole in it fails at save time instead.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManualOrderDto, validateAssignDeliveryDto } from './order.validator.js';

const validManualOrder = {
    restaurantId: '507f1f77bcf86cd799439011',
    customerName: 'Asha',
    customerPhone: '9876543210',
    address: { street: '12 MG Road', city: 'Pune', state: 'Maharashtra' },
    items: '2x Chicken Biryani',
    amount: 480,
};

test('a complete WhatsApp order passes and defaults to cash', () => {
    const dto = validateManualOrderDto(validManualOrder);
    assert.equal(dto.paymentMethod, 'cash');
    assert.equal(dto.amount, 480);
});

test('amount arrives from a form as a string and is coerced to a number', () => {
    const dto = validateManualOrderDto({ ...validManualOrder, amount: '480.50' });
    assert.equal(dto.amount, 480.5);
});

test('every field the order schema requires is rejected when missing', () => {
    for (const field of ['restaurantId', 'customerName', 'customerPhone', 'items', 'amount']) {
        const body = { ...validManualOrder };
        delete body[field];
        assert.throws(() => validateManualOrderDto(body), undefined, `${field} must be required`);
    }

    for (const part of ['street', 'city', 'state']) {
        const address = { ...validManualOrder.address };
        delete address[part];
        assert.throws(
            () => validateManualOrderDto({ ...validManualOrder, address }),
            undefined,
            `address.${part} must be required`,
        );
    }
});

test('an unknown payment method is refused rather than saved and failed later', () => {
    assert.throws(() =>
        validateManualOrderDto({ ...validManualOrder, paymentMethod: 'paytm' }),
    );
});

test('assign carries the admin-edited details through, and needs a partner', () => {
    const dto = validateAssignDeliveryDto({
        deliveryPartnerId: '507f1f77bcf86cd799439022',
        orderDetails: {
            customerPhone: '9876543210',
            address: { street: '12 MG Road' },
            amount: '520',
        },
    });
    assert.equal(dto.orderDetails.customerPhone, '9876543210');
    assert.equal(dto.orderDetails.address.street, '12 MG Road');
    assert.equal(dto.orderDetails.amount, '520');

    assert.throws(() => validateAssignDeliveryDto({ orderDetails: {} }));
});

test('assign with no details is valid — nothing to correct is the common case', () => {
    const dto = validateAssignDeliveryDto({ deliveryPartnerId: '507f1f77bcf86cd799439022' });
    assert.equal(dto.orderDetails, undefined);
});
