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

test('a rider can be picked in the same request, and leaving it out is still valid', () => {
    const withRider = validateManualOrderDto({
        ...validManualOrder,
        deliveryPartnerId: '507f1f77bcf86cd799439012',
    });
    assert.equal(withRider.deliveryPartnerId, '507f1f77bcf86cd799439012');

    const withoutRider = validateManualOrderDto(validManualOrder);
    assert.equal(withoutRider.deliveryPartnerId, undefined);
});

test('coordinates are optional now that the admin form no longer asks for them', () => {
    const dto = validateManualOrderDto(validManualOrder);
    assert.equal(dto.address.latitude, undefined);
    assert.equal(dto.address.longitude, undefined);
});

test('phone numbers are normalised to 10 digits and junk is refused', async () => {
    const { normalizeIndianMobile } = await import('./order.validator.js');
    for (const input of ['9876543210', '+91 98765 43210', '91-9876543210', '09876543210', '(987) 654-3210']) {
        assert.equal(normalizeIndianMobile(input), '9876543210', input);
    }
    for (const input of ['12345', '5876543210', '98765432101', 'abcdefghij', '', '2929392939292929']) {
        assert.equal(normalizeIndianMobile(input), null, input);
    }
    const dto = validateManualOrderDto({ ...validManualOrder, customerPhone: '+91 98765 43210' });
    assert.equal(dto.customerPhone, '9876543210');
    assert.throws(() => validateManualOrderDto({ ...validManualOrder, customerPhone: '2929392939292929' }), /10-digit/);
});

test('names, cities and states must be real words, pin code must be 6 digits', () => {
    assert.throws(() => validateManualOrderDto({ ...validManualOrder, customerName: 'A' }), /at least 2/);
    assert.throws(() => validateManualOrderDto({ ...validManualOrder, customerName: 'Om123' }), /letters/);
    assert.throws(
        () => validateManualOrderDto({ ...validManualOrder, address: { ...validManualOrder.address, city: '411001' } }),
        /City/,
    );
    assert.throws(
        () => validateManualOrderDto({ ...validManualOrder, address: { ...validManualOrder.address, street: 'abc' } }),
        /at least 5/,
    );
    assert.throws(
        () => validateManualOrderDto({ ...validManualOrder, address: { ...validManualOrder.address, zipCode: '34235' } }),
        /6 digits/,
    );
    // Hindi and accented names are fine; extra spaces are collapsed.
    const dto = validateManualOrderDto({
        ...validManualOrder,
        customerName: '  व्यास   जी ',
        address: { ...validManualOrder.address, zipCode: '211001' },
    });
    assert.equal(dto.customerName, 'व्यास जी');
});

test('itemised lines are accepted and checked line by line', () => {
    const lines = [
        { itemId: '507f1f77bcf86cd799439013', name: 'Stuffed Kulcha', quantity: 2, price: 99 },
        { name: 'Extra chutney', quantity: '1', price: '20' },
    ];
    const dto = validateManualOrderDto({ ...validManualOrder, items: undefined, lineItems: lines });
    assert.equal(dto.lineItems.length, 2);
    assert.equal(dto.lineItems[1].quantity, 1);

    const bad = (line, pattern) =>
        assert.throws(() => validateManualOrderDto({ ...validManualOrder, lineItems: [line] }), pattern);
    bad({ name: 'Naan', quantity: 0, price: 79 }, /at least 1/);
    bad({ name: 'Naan', quantity: 100, price: 79 }, /at most 99/);
    bad({ name: 'Naan', quantity: 1.5, price: 79 }, /whole number/);
    bad({ name: 'Naan', quantity: 1, price: -5 }, /negative/);
    bad({ itemId: 'not-an-id', name: 'Naan', quantity: 1, price: 79 }, /menu item/);
});

test('an order needs items and a positive amount', () => {
    const noItems = { ...validManualOrder };
    delete noItems.items;
    assert.throws(() => validateManualOrderDto(noItems), /items required/i);
    assert.throws(() => validateManualOrderDto({ ...validManualOrder, items: undefined, lineItems: [] }), /at least one item/);
    assert.throws(() => validateManualOrderDto({ ...validManualOrder, amount: 0 }), /more than 0/);
});

test('0091 / 091 prefixes are understood too', async () => {
    const { normalizeIndianMobile } = await import('./order.validator.js');
    assert.equal(normalizeIndianMobile('091-9876543210'), '9876543210');
    assert.equal(normalizeIndianMobile('0091 98765 43210'), '9876543210');
});
