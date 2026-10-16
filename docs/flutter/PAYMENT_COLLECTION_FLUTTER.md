# SOHR Rider App: Collecting Payment at the Door (Flutter)

At the customer's door the rider asks how they want to pay:

- **Cash:** the rider takes cash.
- **Online:** the rider shows a **Razorpay UPI QR**. The customer scans it with any UPI app (GPay, PhonePe, Paytm…), and the money goes straight to SOHR's Razorpay account.

The bill already includes **GST** (5%, set in the admin panel). Always collect `payment.amountDue`.

Base URL: `https://sohr.in/api/v1` · all calls need the rider's `Authorization: Bearer <accessToken>`.

---

## 1. When to show the payment step

At the drop, after "Reached customer":

| `payment.method` | `payment.status` | What to do |
|---|---|---|
| `cash` or `razorpay_qr` | not `paid` | Show the **payment step** (Cash / Online), then complete |
| any | `paid` | Already paid: just **Mark as delivered** |
| `razorpay` or `wallet` | `paid` | Paid online in advance: just **Mark as delivered** |

**Amount to collect:** `payment.amountDue` (fall back to `pricing.total`). For a breakdown, use `pricing.subtotal`, `pricing.discount`, `pricing.deliveryFee`, `pricing.tax` (GST) and `pricing.gstRate`.

The server **won't complete** a delivery whose online payment isn't confirmed, so the app can't accidentally hand over unpaid food.

---

## 2. API

| Action | Call | Response `data` |
|---|---|---|
| Online: create a QR | `POST /food/delivery/orders/:orderId/collect/qr` with body `{}` | `{ kind, imageUrl, shortUrl, amount, expiresAt }` |
| Check if paid | `GET /food/delivery/orders/:orderId/payment-status` | `{ payment: { method, status, amountDue, qr }, ... }` |
| Cash | `POST /food/delivery/orders/:orderId/collect/cash` with body `{}` | `{ success: true }` |
| Finish | `PATCH /food/delivery/orders/:orderId/complete` with body `{}` | `{ order }` |

**`collect/qr` responses**
- **`kind: "upi_qr"`:** `imageUrl` is a ready-made UPI QR image hosted by Razorpay. Show it with `Image.network`.
- **`kind: "payment_link"`:** the Razorpay account has no QR Codes product, so you get a payment link (`shortUrl`). Draw it as a QR in the app (package `qr_flutter`). The customer scans it, it opens Razorpay's page, and they pay by UPI or card.
- **Repeat calls:** calling it again for the same order **reuses** the open QR (no duplicates). A QR is valid for **30 minutes**.

**Payment status:** poll `payment-status` every **4 s** while the QR is on screen, and stop as soon as `payment.status == "paid"`. Razorpay also confirms payments to the server directly, so a payment made while the app was closed still counts. Only `"paid"` means paid; never treat `authorized` or `partially_paid` as paid.

**Switching from online to cash:** the customer can change their mind. Calling `collect/cash` after a QR was shown **closes the QR**, so they can't pay twice. If they had **already paid** online, `collect/cash` returns 400 "Order is already paid". Then just complete.

**Errors** (show `message` from the response):

| `message` | Meaning |
|---|---|
| `Online payment is not set up yet…` | Admin hasn't added Razorpay keys. Offer cash. |
| `Razorpay could not create the payment (…)` | Razorpay rejected it. Offer cash. |
| `Order already paid` | Nothing to collect. Complete the delivery. |
| `QR payment not verified yet` (on `complete`) | Customer hasn't finished paying. Keep waiting, or switch to cash. |

---

## 3. Packages

```yaml
dependencies:
  dio: ^5.7.0
  qr_flutter: ^4.1.0   # only needed for the payment-link fallback
```

---

## 4. Code

```dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'api_client.dart'; // Dio client from DELIVERY_FLUTTER_GUIDE.md section 3

typedef Json = Map<String, dynamic>;

/// What the rider must collect (GST included).
num amountToCollect(Json order) =>
    num.tryParse('${order['payment']?['amountDue'] ?? order['pricing']?['total'] ?? 0}') ?? 0;

/// True when the rider must collect money at the door.
bool needsCollection(Json order) {
  final method = '${order['payment']?['method'] ?? ''}';
  final status = '${order['payment']?['status'] ?? ''}';
  return (method == 'cash' || method == 'razorpay_qr') && status != 'paid';
}

class PaymentApi {
  final _dio = ApiClient.instance.dio;
  String _base(String id) => '/food/delivery/orders/$id';

  Future<Json> createQr(String id) async =>
      ((await _dio.post('${_base(id)}/collect/qr', data: {})).data['data'] as Map).cast<String, dynamic>();

  Future<String> status(String id) async {
    final res = await _dio.get('${_base(id)}/payment-status');
    return '${res.data['data']?['payment']?['status'] ?? ''}';
  }

  Future<void> takeCash(String id) => _dio.post('${_base(id)}/collect/cash', data: {});
  Future<void> complete(String id) => _dio.patch('${_base(id)}/complete', data: {});
}

String errorMessage(Object e) {
  try {
    final msg = (e as dynamic).response?.data?['message'];
    if (msg != null) return '$msg';
  } catch (_) {}
  return 'Something went wrong. Try again.';
}

/// Payment step at the door: Cash or Online (UPI QR), then "Mark as delivered".
/// Calls [onDelivered] once the order is completed.
class CollectPaymentSheet extends StatefulWidget {
  const CollectPaymentSheet({super.key, required this.order, required this.onDelivered});
  final Json order;
  final VoidCallback onDelivered;

  @override
  State<CollectPaymentSheet> createState() => _CollectPaymentSheetState();
}

enum _Mode { choose, online, cash, paid }

class _CollectPaymentSheetState extends State<CollectPaymentSheet> {
  final _api = PaymentApi();
  late final String _id = '${widget.order['_id'] ?? widget.order['orderMongoId']}';
  _Mode _mode = _Mode.choose;
  Json? _qr;
  bool _busy = false;
  String? _error;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    if (!needsCollection(widget.order)) _mode = _Mode.paid;
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() body) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await body();
    } catch (e) {
      setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _online() => _run(() async {
        final qr = await _api.createQr(_id);
        setState(() {
          _qr = qr;
          _mode = _Mode.online;
        });
        _poll?.cancel();
        _poll = Timer.periodic(const Duration(seconds: 4), (_) => _checkPaid());
      });

  Future<void> _checkPaid() async {
    try {
      if (await _api.status(_id) == 'paid') {
        _poll?.cancel();
        if (mounted) setState(() => _mode = _Mode.paid);
      }
    } catch (_) {/* keep polling */}
  }

  void _cash() => _run(() async {
        try {
          await _api.takeCash(_id);
          _poll?.cancel();
          setState(() => _mode = _Mode.cash);
        } catch (e) {
          // The customer already paid online before switching: nothing to collect.
          if (errorMessage(e).contains('already paid')) {
            _poll?.cancel();
            setState(() => _mode = _Mode.paid);
          } else {
            rethrow;
          }
        }
      });

  void _complete() => _run(() async {
        await _api.complete(_id);
        widget.onDelivered();
      });

  @override
  Widget build(BuildContext context) {
    final amount = amountToCollect(widget.order);
    final gst = widget.order['pricing']?['tax'];
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(_mode == _Mode.paid ? 'Payment received' : 'Collect payment', style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          Text('₹${amount.toStringAsFixed(2)}', style: theme.textTheme.displaySmall?.copyWith(fontWeight: FontWeight.bold)),
          if (gst != null && gst != 0) Text('Includes GST ₹$gst', style: theme.textTheme.bodySmall),
          const SizedBox(height: 20),

          if (_mode == _Mode.choose) ...[
            FilledButton.icon(
              onPressed: _busy ? null : _online,
              icon: const Icon(Icons.qr_code),
              label: const Text('Online (UPI QR)'),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _busy ? null : _cash,
              icon: const Icon(Icons.payments),
              label: const Text('Cash'),
            ),
          ],

          if (_mode == _Mode.online && _qr != null) ...[
            Center(child: _QrView(qr: _qr!)),
            const SizedBox(height: 12),
            const Text('Ask the customer to scan with any UPI app.', textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: const [
              SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
              SizedBox(width: 8),
              Text('Waiting for payment…'),
            ]),
            const SizedBox(height: 16),
            TextButton(onPressed: _busy ? null : _cash, child: const Text('Customer wants to pay cash instead')),
          ],

          if (_mode == _Mode.cash)
            Text('Collect ₹${amount.toStringAsFixed(2)} in cash, then mark as delivered.', textAlign: TextAlign.center),

          if (_mode == _Mode.cash || _mode == _Mode.paid) ...[
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _complete,
              child: _busy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Mark as delivered'),
            ),
          ],

          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: theme.colorScheme.error), textAlign: TextAlign.center),
          ],
        ],
      ),
    );
  }
}

class _QrView extends StatelessWidget {
  const _QrView({required this.qr});
  final Json qr;

  @override
  Widget build(BuildContext context) {
    // Razorpay UPI QR image when available, otherwise draw the payment link as a QR.
    if (qr['kind'] == 'upi_qr' && '${qr['imageUrl'] ?? ''}'.isNotEmpty) {
      return Image.network('${qr['imageUrl']}', width: 260, fit: BoxFit.contain);
    }
    return QrImageView(data: '${qr['shortUrl']}', size: 240, backgroundColor: Colors.white);
  }
}
```

**Using it at the drop:**

```dart
if (needsCollection(order)) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    isDismissible: false,
    builder: (_) => CollectPaymentSheet(order: order, onDelivered: () {
      Navigator.pop(context);
      controller.refresh(); // reload active orders
    }),
  );
} else {
  await PaymentApi().complete(order['_id']);
}
```

If you use the multi-order controller (`MULTI_ORDER_FLUTTER.md`), call this sheet from its "Mark as delivered" step for cash and collect-at-door orders.

---

## 5. Test

The admin sets Razorpay keys in **Admin → Delivery & Platform Fee section → Payment Gateway (Razorpay)**. Use **test keys** (`rzp_test_…`) first; then no real money moves.

1. In the admin panel, create a WhatsApp order with **"Collect at the door (cash or online QR)"** and send it to the test rider. The bill shows GST 5%.
2. **Cash:** at the door, tap **Cash** and then **Mark as delivered**. The admin orders table shows the payment as **Collected**.
3. **Online:** tap **Online (UPI QR)**. A QR appears. In test mode, pay it using Razorpay's test UPI flow. Within a few seconds the sheet shows **Payment received**, then **Mark as delivered**. The admin table shows **Paid**.
4. **Switch:** show the QR, then tap **"Customer wants to pay cash instead"**. The QR stops working.
5. **No keys:** with Razorpay turned off in the admin panel, **Online** shows "Online payment is not set up yet…". Cash still works.
