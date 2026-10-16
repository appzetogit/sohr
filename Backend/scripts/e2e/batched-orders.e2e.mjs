/**
 * End-to-end check for WhatsApp orders with a chosen rider, and for batching several
 * orders onto one rider.
 *
 * Talks to a REAL running API over HTTP and seeds/inspects a THROWAWAY database
 * directly. It refuses to run unless the database name ends in "_e2e", and it drops
 * that database when it finishes.
 *
 * Run (with an API instance already started against the same e2e database):
 *   E2E_API=http://127.0.0.1:5055/api/v1 \
 *   MONGO_URI=mongodb://127.0.0.1:27017/sohr_e2e \
 *   node --test scripts/e2e/batched-orders.e2e.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { FoodAdmin } from '../../src/core/admin/admin.model.js';
import { FoodDeliveryPartner } from '../../src/modules/food/delivery/models/deliveryPartner.model.js';
import { FoodRestaurant } from '../../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodOrder } from '../../src/modules/food/orders/models/order.model.js';
import { FoodItem } from '../../src/modules/food/admin/models/food.model.js';
import { FoodFeeSettings } from '../../src/modules/food/admin/models/feeSettings.model.js';
import { PaymentGatewaySettings } from '../../src/core/payments/paymentGatewaySettings.js';

const API = process.env.E2E_API;
const MONGO_URI = process.env.MONGO_URI;
const DEFAULT_OTP = '1234';
// Must match the API instance under test (DELIVERY_DROP_OTP_REQUIRED on the server).
const DROP_OTP_REQUIRED = process.env.E2E_DROP_OTP_REQUIRED !== 'false';

if (!API || !MONGO_URI) throw new Error('Set E2E_API and MONGO_URI');
const dbName = new URL(MONGO_URI).pathname.replace(/^\//, '');
if (!dbName.endsWith('_e2e')) {
  throw new Error(`Refusing to run against "${dbName}": the database name must end in _e2e`);
}

const adminEmail = 'e2e-admin@sohr.test';
const adminPassword = crypto.randomBytes(12).toString('hex');
const state = { riders: {} };

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, data: json?.data };
}

async function riderLogin(phone) {
  const req = await call('POST', '/food/auth/delivery/request-otp', { body: { phone } });
  assert.equal(req.status, 200, `request-otp: ${JSON.stringify(req.json)}`);
  const ver = await call('POST', '/food/auth/delivery/verify-otp', { body: { phone, otp: DEFAULT_OTP } });
  assert.equal(ver.status, 200, `verify-otp: ${JSON.stringify(ver.json)}`);
  return ver.data.accessToken;
}

const manualOrder = (overrides = {}) => ({
  restaurantId: String(state.restaurantId),
  customerName: 'Test Customer',
  customerPhone: `9${String(Date.now()).slice(-9)}`,
  address: { street: '12 Test Street, Civil Lines', city: 'Prayagraj', state: 'Uttar Pradesh', zipCode: '211001' },
  items: '1x Paneer Tikka (8 pcs), 2x Butter Naan',
  amount: 507,
  paymentMethod: 'cash',
  ...overrides,
});

const orderKey = (o) => String(o?._id || o?.orderMongoId || o?.id);
const listDocs = (data) => data?.docs || data?.items || data?.data || [];

before(async () => {
  await mongoose.connect(MONGO_URI);
  // Build every index (2dsphere included) before the first request. Production always
  // has them; without this a fresh test database can race the API's background index
  // build and let invalid geo data through, which is exactly how a live bug slipped by.
  await Promise.all([FoodOrder.init(), FoodRestaurant.init(), FoodDeliveryPartner.init(), FoodAdmin.init()]);
  const orderIndexes = await FoodOrder.collection.indexes();
  assert.ok(
    orderIndexes.some((index) => index.key['deliveryAddress.location'] === '2dsphere'),
    'the delivery address 2dsphere index must exist before testing',
  );

  await FoodAdmin.create({
    email: adminEmail,
    password: adminPassword,
    name: 'E2E Admin',
    role: 'ADMIN',
    adminType: 'super_admin',
    isActive: true,
    servicesAccess: ['food'],
  });

  const restaurant = await FoodRestaurant.findOne({ status: 'approved' }).lean();
  assert.ok(restaurant, 'seed the e2e database with seed-sohr-restaurant.js first');
  state.restaurantId = restaurant._id;

  for (const [key, phone] of [['ravi', '7000000001'], ['sunil', '7000000002']]) {
    const partner = await FoodDeliveryPartner.create({
      name: `E2E ${key}`,
      phone,
      status: 'approved',
      availabilityStatus: 'online',
      lastLat: 25.4513,
      lastLng: 81.8341,
      lastLocation: { type: 'Point', coordinates: [81.8341, 25.4513] },
      lastLocationAt: new Date(),
    });
    state.riders[key] = { id: String(partner._id), phone };
  }

  const login = await call('POST', '/food/auth/admin/login', {
    body: { email: adminEmail, password: adminPassword },
  });
  assert.equal(login.status, 200, `admin login: ${JSON.stringify(login.json)}`);
  state.adminToken = login.data.accessToken;

  for (const rider of Object.values(state.riders)) {
    rider.token = await riderLogin(rider.phone);
  }
});

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }
});

test('a WhatsApp order can be created and sent straight to a chosen rider', async () => {
  const res = await call('POST', '/food/admin/orders/manual', {
    token: state.adminToken,
    body: manualOrder({ deliveryPartnerId: state.riders.ravi.id }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  state.orderA = orderKey(res.data.order || res.data);

  const saved = await FoodOrder.findById(state.orderA).lean();
  // Typed-in address, no coordinates: must save without a half-built geo point.
  assert.equal(saved.deliveryAddress.location, undefined);
  assert.equal(saved.dispatch.status, 'assigned');
  assert.equal(saved.dispatch.assignedBy, 'ADMIN');
  assert.equal(String(saved.dispatch.deliveryPartnerId), state.riders.ravi.id);
});

test('an invalid rider fails the request and leaves no order behind', async () => {
  const before = await FoodOrder.countDocuments();
  const res = await call('POST', '/food/admin/orders/manual', {
    token: state.adminToken,
    body: manualOrder({ deliveryPartnerId: new mongoose.Types.ObjectId().toString() }),
  });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assert.equal(await FoodOrder.countDocuments(), before);
});

test('the rider accepts the first order and is now on a trip', async () => {
  const res = await call('PATCH', `/food/delivery/orders/${state.orderA}/accept`, {
    token: state.riders.ravi.token,
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const saved = await FoodOrder.findById(state.orderA).lean();
  assert.equal(saved.dispatch.status, 'accepted');
});

test('the admin can batch a second order onto the same busy rider', async () => {
  const res = await call('POST', '/food/admin/orders/manual', {
    token: state.adminToken,
    body: manualOrder({ deliveryPartnerId: state.riders.ravi.id, amount: 349 }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  state.orderB = orderKey(res.data.order || res.data);
});

test('assigning an existing order to a busy rider from the table also works', async () => {
  const created = await call('POST', '/food/admin/orders/manual', {
    token: state.adminToken,
    body: manualOrder({ amount: 199 }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  state.orderC = orderKey(created.data.order || created.data);

  const assign = await call('PATCH', `/food/admin/orders/${state.orderC}/assign`, {
    token: state.adminToken,
    body: { deliveryPartnerId: state.riders.ravi.id },
  });
  assert.equal(assign.status, 200, JSON.stringify(assign.json));
});

test('the admin rider list shows how many orders each rider is holding', async () => {
  const res = await call('GET', '/food/admin/delivery/partners?limit=100&page=1', { token: state.adminToken });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const rows = res.data.deliveryPartners;
  const ravi = rows.find((r) => String(r._id) === state.riders.ravi.id);
  const sunil = rows.find((r) => String(r._id) === state.riders.sunil.id);
  assert.equal(ravi.activeOrderCount, 3, 'one accepted + two waiting for acceptance');
  assert.equal(sunil.activeOrderCount, 0);
});

test('the busy rider sees their trip and both pending admin assignments', async () => {
  const res = await call('GET', '/food/delivery/orders/available', { token: state.riders.ravi.token });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const ids = listDocs(res.data).map(orderKey).sort();
  assert.deepEqual(ids, [state.orderA, state.orderB, state.orderC].sort());
});

test('the busy rider can accept admin-batched orders mid-trip', async () => {
  for (const id of [state.orderB, state.orderC]) {
    const res = await call('PATCH', `/food/delivery/orders/${id}/accept`, { token: state.riders.ravi.token });
    assert.equal(res.status, 200, `${id}: ${JSON.stringify(res.json)}`);
  }
});

test('current trip lists every accepted order and keeps activeOrder for old apps', async () => {
  const res = await call('GET', '/food/delivery/orders/current', { token: state.riders.ravi.token });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.data.activeOrders.length, 3);
  assert.ok(res.data.activeOrder, 'activeOrder must still be present');
  assert.equal(orderKey(res.data.activeOrder), orderKey(res.data.activeOrders[0]));
});

test('a busy rider still cannot grab an order that was not assigned to them', async () => {
  const created = await call('POST', '/food/admin/orders/manual', {
    token: state.adminToken,
    body: manualOrder({ amount: 99 }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const id = orderKey(created.data.order || created.data);

  const res = await call('PATCH', `/food/delivery/orders/${id}/accept`, { token: state.riders.ravi.token });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assert.match(res.json.message, /already have an active delivery/i);

  // ...and a free rider can take it.
  const free = await call('PATCH', `/food/delivery/orders/${id}/accept`, { token: state.riders.sunil.token });
  assert.equal(free.status, 200, JSON.stringify(free.json));
});

test('another rider cannot accept an order batched onto someone else', async () => {
  const created = await call('POST', '/food/admin/orders/manual', {
    token: state.adminToken,
    body: manualOrder({ deliveryPartnerId: state.riders.ravi.id, amount: 149 }),
  });
  const id = orderKey(created.data.order || created.data);
  await FoodOrder.updateOne({ _id: id }, { $set: { 'dispatch.status': 'assigned' } });

  const res = await call('PATCH', `/food/delivery/orders/${id}/accept`, { token: state.riders.sunil.token });
  assert.notEqual(res.status, 200, 'a different rider must not be able to take it');
});

test('finishing one batched order leaves the others on the rider', async () => {
  const token = state.riders.ravi.token;
  const id = state.orderA;

  for (const [method, path, body] of [
    ['PATCH', 'reached-pickup'],
    ['PATCH', 'confirm-pickup', {}],
    ['PATCH', 'reached-drop'],
  ]) {
    const res = await call(method, `/food/delivery/orders/${id}/${path}`, { token, body });
    assert.equal(res.status, 200, `${path}: ${JSON.stringify(res.json)}`);
  }

  const saved = await FoodOrder.findById(id).select('+deliveryOtp').lean();

  if (DROP_OTP_REQUIRED) {
    assert.equal(saved.deliveryVerification.dropOtp.required, true);
    assert.match(saved.deliveryOtp, /^\d{4}$/);

    // Without the customer's code the delivery cannot be completed...
    const blocked = await call('PATCH', `/food/delivery/orders/${id}/complete`, { token, body: {} });
    assert.equal(blocked.status, 400, `complete without code: ${JSON.stringify(blocked.json)}`);

    // ...and with it, it can.
    const otp = await call('POST', `/food/delivery/orders/${id}/verify-drop-otp`, { token, body: { otp: saved.deliveryOtp } });
    assert.equal(otp.status, 200, `verify-drop-otp: ${JSON.stringify(otp.json)}`);
  } else {
    // Handover code switched off: none is generated, and old app builds that still
    // call verify-drop-otp (with no code) are let through.
    assert.equal(saved.deliveryVerification.dropOtp.required, false);
    assert.ok(!saved.deliveryOtp, 'no handover code should be generated');
    const otp = await call('POST', `/food/delivery/orders/${id}/verify-drop-otp`, { token, body: {} });
    assert.equal(otp.status, 200, `verify-drop-otp no-op: ${JSON.stringify(otp.json)}`);
  }

  const done = await call('PATCH', `/food/delivery/orders/${id}/complete`, { token, body: {} });
  assert.equal(done.status, 200, `complete: ${JSON.stringify(done.json)}`);

  const current = await call('GET', '/food/delivery/orders/current', { token });
  const remaining = current.data.activeOrders.map(orderKey).sort();
  assert.deepEqual(remaining, [state.orderB, state.orderC].sort());
});

test('the admin menu lists the real menu items for order-item suggestions', async () => {
  const res = await call('GET', `/food/admin/restaurants/${state.restaurantId}/menu`, { token: state.adminToken });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const items = res.data.menu.sections.flatMap((section) => section.items || []);
  assert.ok(items.length > 0, 'menu must not be empty');
  assert.ok(items.every((item) => item.name && Number.isFinite(Number(item.price))));
});

test('rider apps are told up front whether a handover code will be needed', async () => {
  const res = await call('GET', '/food/delivery/orders/current', { token: state.riders.ravi.token });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  for (const order of res.data.activeOrders) {
    assert.equal(order.deliveryVerification.dropOtp.required, DROP_OTP_REQUIRED);
  }
});

test('itemised WhatsApp orders keep one line per dish, priced from the menu', async () => {
  const [kulcha, naan] = await FoodItem.find({ restaurantId: state.restaurantId }).limit(2).lean();
  const res = await call('POST', '/food/admin/orders/manual', {
    token: state.adminToken,
    body: manualOrder({
      items: undefined,
      lineItems: [
        // Wrong name/price on purpose: the server must use the menu's own values.
        { itemId: String(kulcha._id), name: 'tampered', quantity: 2, price: 1 },
        { itemId: String(naan._id), name: naan.name, quantity: 3, price: naan.price },
        { name: 'Extra green chutney', quantity: 1, price: 20 },
      ],
      amount: 2 * kulcha.price + 3 * naan.price + 20 - 10, // agreed ₹10 discount
    }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const saved = await FoodOrder.findById(orderKey(res.data.order)).lean();

  assert.deepEqual(
    saved.items.map((i) => [i.name, i.quantity, i.price]),
    [
      [kulcha.name, 2, kulcha.price],
      [naan.name, 3, naan.price],
      ['Extra green chutney', 1, 20],
    ],
  );
  assert.equal(saved.items[0].itemId, String(kulcha._id));
  assert.equal(saved.items[2].itemId, 'custom');
  const itemsTotal = 2 * kulcha.price + 3 * naan.price + 20;
  assert.equal(saved.pricing.subtotal, itemsTotal);
  assert.equal(saved.pricing.discount, 10);
  assert.equal(saved.pricing.total, itemsTotal - 10);
});

test('a dish that is not on this restaurant menu is refused', async () => {
  const before = await FoodOrder.countDocuments();
  const res = await call('POST', '/food/admin/orders/manual', {
    token: state.adminToken,
    body: manualOrder({
      items: undefined,
      lineItems: [{ itemId: new mongoose.Types.ObjectId().toString(), name: 'Ghost dish', quantity: 1, price: 50 }],
    }),
  });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assert.match(res.json.message, /not on this restaurant/i);
  assert.equal(await FoodOrder.countDocuments(), before);
});

test('bad customer details are refused with a clear message', async () => {
  for (const [patch, pattern] of [
    [{ customerPhone: '2929392939292929239' }, /10-digit/],
    [{ customerName: 'fgdsuigui1' }, /letters/],
    [{ amount: 0 }, /more than 0/],
    [{ address: { street: '12 Test Street', city: 'Prayagraj', state: 'Uttar Pradesh', zipCode: '34235' } }, /6 digits/],
  ]) {
    const res = await call('POST', '/food/admin/orders/manual', { token: state.adminToken, body: manualOrder(patch) });
    assert.equal(res.status, 400, JSON.stringify(res.json));
    assert.match(res.json.message, pattern);
  }
});

test('a pasted Google Maps link is kept for the rider and becomes the delivery pin', async () => {
  const link = 'https://maps.google.com/?q=25.4401,81.8463';
  const res = await call('POST', '/food/admin/orders/manual', {
    token: state.adminToken,
    body: manualOrder({ locationLink: link, deliveryPartnerId: state.riders.sunil.id }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const id = orderKey(res.data.order);
  const saved = await FoodOrder.findById(id).lean();
  assert.equal(saved.deliveryAddress.locationLink, link);
  assert.deepEqual(saved.deliveryAddress.location.coordinates, [81.8463, 25.4401]);
  assert.ok(saved.pricing.distanceKm > 0, 'distance comes from the pin');

  // The rider sees it on the offer list and after accepting.
  const offers = await call('GET', '/food/delivery/orders/available', { token: state.riders.sunil.token });
  const offer = listDocs(offers.data).find((o) => orderKey(o) === id);
  assert.equal(offer.customerLocationLink, link);
});

test('only Google Maps links are accepted', async () => {
  const res = await call('POST', '/food/admin/orders/manual', {
    token: state.adminToken,
    body: manualOrder({ locationLink: 'https://evil.example/maps?q=25.44,81.84' }),
  });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assert.match(res.json.message, /Google Maps link/);
});

test('a link without coordinates is kept, and the order still saves without a pin', async () => {
  const link = 'https://www.google.com/maps/place/Civil+Lines,+Prayagraj';
  const res = await call('POST', '/food/admin/orders/manual', {
    token: state.adminToken,
    body: manualOrder({ locationLink: link }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const saved = await FoodOrder.findById(orderKey(res.data.order)).lean();
  assert.equal(saved.deliveryAddress.locationLink, link);
  assert.equal(saved.deliveryAddress.location, undefined);
});

test('the link can be added when assigning from the table', async () => {
  const created = await call('POST', '/food/admin/orders/manual', { token: state.adminToken, body: manualOrder() });
  const id = orderKey(created.data.order);
  const link = 'https://www.google.com/maps/@25.4501,81.8401,17z';
  const assign = await call('PATCH', `/food/admin/orders/${id}/assign`, {
    token: state.adminToken,
    body: { deliveryPartnerId: state.riders.sunil.id, orderDetails: { locationLink: link } },
  });
  assert.equal(assign.status, 200, JSON.stringify(assign.json));
  const saved = await FoodOrder.findById(id).lean();
  assert.equal(saved.deliveryAddress.locationLink, link);
  assert.deepEqual(saved.deliveryAddress.location.coordinates, [81.8401, 25.4501]);
});

// ---------------------------------------------------------------- GST + payment at the door

test('WhatsApp orders add GST from Fee Settings on top of the agreed amount', async () => {
  await FoodFeeSettings.deleteMany({});
  await FoodFeeSettings.create({ gstRate: 5, isActive: true });
  const res = await call('POST', '/food/admin/orders/manual', {
    token: state.adminToken,
    body: manualOrder({ amount: 200 }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const saved = await FoodOrder.findById(orderKey(res.data.order)).lean();
  assert.equal(saved.pricing.gstRate, 5);
  assert.equal(saved.pricing.tax, 10);
  assert.equal(saved.pricing.total, 210);
  assert.equal(saved.payment.amountDue, 210, 'the rider collects the GST-inclusive bill');
  state.gstOrder = orderKey(res.data.order);
});

test('editing the amount to collect at assign time does not add GST twice', async () => {
  const res = await call('PATCH', `/food/admin/orders/${state.gstOrder}/assign`, {
    token: state.adminToken,
    body: { deliveryPartnerId: state.riders.sunil.id, orderDetails: { amount: 315 } },
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const saved = await FoodOrder.findById(state.gstOrder).lean();
  assert.equal(saved.pricing.total, 315);
  assert.equal(saved.pricing.tax, 15); // 300 + 5%
  assert.equal(saved.payment.amountDue, 315);
});

test('collect-at-door orders start unpaid; only "already paid online" is paid', async () => {
  for (const [method, expected] of [['cash', 'cod_pending'], ['razorpay_qr', 'cod_pending'], ['razorpay', 'paid']]) {
    const res = await call('POST', '/food/admin/orders/manual', {
      token: state.adminToken,
      body: manualOrder({ paymentMethod: method }),
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const saved = await FoodOrder.findById(orderKey(res.data.order)).lean();
    assert.equal(saved.payment.status, expected, method);
  }
});

test('payment gateway settings: super admin only, validated, secrets never returned', async () => {
  const empty = await call('GET', '/food/admin/payment-gateway', { token: state.adminToken });
  assert.equal(empty.status, 200, JSON.stringify(empty.json));
  assert.equal(empty.data.enabled, false);

  const badId = await call('PUT', '/food/admin/payment-gateway', { token: state.adminToken, body: { keyId: 'pk_live_123' } });
  assert.equal(badId.status, 400);
  const noSecret = await call('PUT', '/food/admin/payment-gateway', {
    token: state.adminToken,
    body: { enabled: true, keyId: 'rzp_test_E2eKeyId12345' },
  });
  assert.equal(noSecret.status, 400);
  assert.match(noSecret.json.message, /Key Secret/);

  const secret = 'e2eSecretValue1234567890';
  const saved = await call('PUT', '/food/admin/payment-gateway', {
    token: state.adminToken,
    body: { enabled: true, keyId: 'rzp_test_E2eKeyId12345', keySecret: secret, webhookSecret: 'e2e-webhook-secret' },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(saved.data.mode, 'test');
  assert.equal(saved.data.hasKeySecret, true);
  assert.equal(saved.data.hasWebhookSecret, true);
  assert.ok(!JSON.stringify(saved.json).includes(secret), 'secret must never come back');

  const doc = await PaymentGatewaySettings.findOne({ key: 'razorpay' }).lean();
  assert.ok(doc.keySecretEnc.startsWith('v1:'));
  assert.ok(!doc.keySecretEnc.includes(secret), 'stored encrypted');

  // Saving again with a blank secret keeps the stored one.
  const keep = await call('PUT', '/food/admin/payment-gateway', { token: state.adminToken, body: { enabled: true } });
  assert.equal(keep.status, 200);
  assert.equal((await PaymentGatewaySettings.findOne({ key: 'razorpay' }).lean()).keySecretEnc, doc.keySecretEnc);

  // Riders can't read it.
  const rider = await call('GET', '/food/admin/payment-gateway', { token: state.riders.ravi.token });
  assert.ok([401, 403].includes(rider.status), `rider got ${rider.status}`);

  // Test connection with made-up keys: Razorpay rejects them with a readable message.
  const test = await call('POST', '/food/admin/payment-gateway/test', {
    token: state.adminToken,
    body: { keyId: 'rzp_test_E2eKeyId12345', keySecret: secret },
  });
  assert.equal(test.status, 400, JSON.stringify(test.json));
  assert.match(test.json.message, /Razorpay said/);
});

test('webhook rejects bad signatures and accepts correctly signed collection events', async () => {
  const crypto = await import('node:crypto');
  const body = JSON.stringify({ event: 'qr_code.credited', payload: { qr_code: { entity: { id: 'qr_unknown_e2e' } } } });
  const send = (signature) =>
    fetch(`${API}/payments/webhook/razorpay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature },
      body,
    });

  const bad = await send('0'.repeat(64));
  assert.equal(bad.status, 400);

  // Settings refresh every 30 s in other processes; the API that saved them is current.
  const good = await send(crypto.createHmac('sha256', 'e2e-webhook-secret').update(body).digest('hex'));
  assert.equal(good.status, 200, await good.text());
});

test('online collection fails clearly when Razorpay is switched off', async () => {
  await call('PUT', '/food/admin/payment-gateway', { token: state.adminToken, body: { enabled: false } });
  const created = await call('POST', '/food/admin/orders/manual', {
    token: state.adminToken,
    body: manualOrder({ deliveryPartnerId: state.riders.sunil.id }),
  });
  const id = orderKey(created.data.order);
  await call('PATCH', `/food/delivery/orders/${id}/accept`, { token: state.riders.sunil.token });
  const res = await call('POST', `/food/delivery/orders/${id}/collect/qr`, { token: state.riders.sunil.token, body: {} });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assert.match(res.json.message, /not set up/i);

  // Cash still works.
  const cash = await call('POST', `/food/delivery/orders/${id}/collect/cash`, { token: state.riders.sunil.token, body: {} });
  assert.equal(cash.status, 200, JSON.stringify(cash.json));
});
