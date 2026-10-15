# SOHR Rider App: Multiple Orders (Flutter)

Drop-in Flutter code for riders carrying several orders. An admin can assign extra orders to a rider who is already on a delivery (for example several WhatsApp orders going the same way).

These files haven't been compiled here (no Flutter SDK on the machine they were written on). Expect small adjustments to fit your app's existing classes.

## Packages

`dio`, `socket_io_client` (3.x), `geolocator`, `provider`. They need Dart 3 (Flutter 3.10+) for the `switch` expressions and record patterns.

## Wiring it in

```dart
// after login, with the access token
final socket = io.io(
  'https://sohr.in',
  io.OptionBuilder()
      .setTransports(['websocket'])
      .setAuth({'token': accessToken})
      .enableReconnection()
      .build(),
);

runApp(
  ChangeNotifierProvider(
    create: (_) => ActiveTripsController(socket)..start(),
    child: const MaterialApp(home: TripsScreen()),
  ),
);
```

`ApiClient` (imported by `trip_api.dart`) is the Dio client from section 3 of `DELIVERY_FLUTTER_GUIDE.md`. Its base URL is `https://sohr.in/api/v1`, and it attaches the Bearer token and refreshes it on 401. After a token refresh, reconnect the socket with the new token.

## How it behaves

- **Idle rider:** offers arrive (socket `new_order` / `new_order_available`, plus a poll every 15 s). Accepting one makes it the focused order.
- **Rider on a trip:** only offers with `assignedByAdmin: true` are shown; the server refuses the rest anyway. Accepting adds the order to **Next deliveries**, and the current delivery stays on screen.
- **Offer timer:** each offer counts down to `acceptanceDeadlineAt` (about 45 s). If it isn't answered in time, the server sends the order back to the admin, and the app won't show it again.
- **Steps:** each order moves through its own steps (`reached-pickup` → `confirm-pickup` → `reached-drop` → `complete`). Tap an order in Next deliveries to work on it.
- **Finishing:** when an order is completed, focus moves to the next active order automatically.
- **Live location:** sent for **every** picked-up order, so each customer sees the rider move.
- **No handover code at the door:** SOHR has it off (`dropOtp.required == false`), so "Mark as delivered" collects cash for COD orders and then completes. If the code is ever switched back on, the same screen asks for it.

## Test

1. In the admin panel, create a WhatsApp order and send it to the rider. The rider accepts it but **doesn't deliver yet**.
2. Create a second order and send it to the same rider. The offer sheet should appear on top of the current delivery, labelled "Extra order added by admin".
3. Accept it. The app should say "2 active deliveries", and the new order should be under Next deliveries.
4. Deliver both, in either order.

---

## Code

Three files. Put them in your app (for example `lib/trips/`) and adjust the imports.

### 1. `trip_api.dart`: API calls and order helpers

```dart
// SOHR rider app: API calls for one or more simultaneous deliveries.
//
// Uses the Dio client from DELIVERY_FLUTTER_GUIDE.md section 3 (ApiClient), whose
// baseUrl is https://sohr.in/api/v1 and which adds the Bearer token / refreshes it.
// Every trip call takes the order's own id, so batched orders progress independently.

import 'package:dio/dio.dart';
import 'api_client.dart'; // from the guide, section 3

typedef Json = Map<String, dynamic>;

class TripApi {
  TripApi([Dio? dio]) : _dio = dio ?? ApiClient.instance.dio;
  final Dio _dio;

  static const _base = '/food/delivery/orders';

  /// Every accepted, unfinished order (most recently updated first).
  /// Falls back to the old single `activeOrder` for older servers.
  Future<List<Json>> activeOrders() async {
    final res = await _dio.get('$_base/current');
    final data = (res.data['data'] ?? {}) as Json;
    final list = data['activeOrders'];
    if (list is List) return list.cast<Json>();
    final single = data['activeOrder'];
    return single is Json ? [single] : [];
  }

  /// Offers waiting for this rider plus their accepted orders.
  Future<List<Json>> available() async {
    final res = await _dio.get('$_base/available', queryParameters: {'limit': 50});
    final data = (res.data['data'] ?? {}) as Json;
    final docs = data['docs'] ?? data['items'] ?? data['data'] ?? [];
    return (docs as List).cast<Json>();
  }

  Future<void> accept(String id) => _dio.patch('$_base/$id/accept');
  Future<void> reject(String id) => _dio.patch('$_base/$id/reject');
  Future<void> reachedPickup(String id) => _dio.patch('$_base/$id/reached-pickup');
  Future<void> confirmPickup(String id, {String? billImageUrl}) => _dio.patch(
        '$_base/$id/confirm-pickup',
        data: {if (billImageUrl != null) 'billImageUrl': billImageUrl},
      );
  Future<void> reachedDrop(String id) => _dio.patch('$_base/$id/reached-drop');

  /// SOHR has the handover code switched off (dropOtp.required == false), so this is
  /// only called when an order says it needs one.
  Future<void> verifyDropOtp(String id, String otp) =>
      _dio.post('$_base/$id/verify-drop-otp', data: {'otp': otp});

  Future<void> complete(String id) => _dio.patch('$_base/$id/complete', data: {});
}

/// Small helpers for reading order maps safely.
class OrderX {
  static String id(Json o) => '${o['_id'] ?? o['orderMongoId'] ?? o['id'] ?? ''}';
  static String displayId(Json o) => '${o['order_id'] ?? o['orderId'] ?? id(o)}';

  /// en_route_to_pickup | at_pickup | en_route_to_delivery | at_drop | delivered | completed
  static String phase(Json o) =>
      '${(o['deliveryState'] as Json?)?['currentPhase'] ?? 'en_route_to_pickup'}';

  static bool isPickedUp(Json o) =>
      const {'en_route_to_delivery', 'at_drop'}.contains(phase(o));

  static bool dropOtpRequired(Json o) =>
      ((o['deliveryVerification'] as Json?)?['dropOtp'] as Json?)?['required'] != false;

  static bool isCashOnDelivery(Json o) {
    final m = '${o['paymentMethod'] ?? (o['payment'] as Json?)?['method'] ?? ''}'.toLowerCase();
    return m == 'cash' || m == 'razorpay_qr';
  }

  static String restaurantName(Json o) =>
      '${(o['restaurantId'] as Json?)?['restaurantName'] ?? o['restaurantName'] ?? ''}';

  static String customerName(Json o) => '${o['customerName'] ?? ''}';
  static String dropAddress(Json o) {
    final a = (o['deliveryAddress'] as Json?) ?? {};
    return [a['street'], a['city']].where((v) => v != null && '$v'.isNotEmpty).join(', ');
  }
}
```

### 2. `active_trips_controller.dart`: state, offers, socket, location

```dart
// SOHR rider app: state for several deliveries at once (admin batching).
//
// How batching works on the server:
//  - Auto-dispatch offers a rider one order at a time.
//  - An admin can assign more orders to a rider who is already on a trip. Those arrive
//    on the socket as `new_order` with `assignedByAdmin: true`, and the rider may accept
//    them mid-trip. Anything else is refused while busy, so ignore other offers then.
//  - An offer must be answered within ~45 s (acceptanceDeadlineAt), otherwise it goes
//    back to the admin.
//  - GET /orders/current returns `activeOrders` (all accepted, unfinished orders).
//
// Usage (provider):
//   ChangeNotifierProvider(create: (_) => ActiveTripsController(socket)..start())

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'trip_api.dart';

class OrderOffer {
  OrderOffer(this.data)
      : deadline = DateTime.tryParse('${data['acceptanceDeadlineAt'] ?? ''}')?.toLocal() ??
            DateTime.now().add(const Duration(seconds: 45));

  final Json data;
  final DateTime deadline;

  String get id => '${data['orderMongoId'] ?? data['_id'] ?? data['orderId'] ?? ''}';
  String get displayId => '${data['orderId'] ?? id}';
  bool get assignedByAdmin => data['assignedByAdmin'] == true;
  String get restaurantName => '${data['restaurantName'] ?? ''}';
  String get dropAddress => '${data['customerAddress'] ?? ''}';
  num get earning => num.tryParse('${data['riderEarning'] ?? data['earnings'] ?? 0}') ?? 0;
  Duration get timeLeft {
    final left = deadline.difference(DateTime.now());
    return left.isNegative ? Duration.zero : left;
  }
}

class ActiveTripsController extends ChangeNotifier {
  ActiveTripsController(this._socket, {TripApi? api}) : _api = api ?? TripApi();

  final io.Socket _socket;
  final TripApi _api;

  /// Accepted, unfinished orders. Usually one; more when the admin batched orders.
  List<Json> trips = [];

  /// Which trip the map / action buttons are showing.
  String? focusedId;

  /// Offers waiting for an answer, oldest first. Shown one at a time.
  final List<OrderOffer> offers = [];

  /// Offers the rider declined or let expire; polling must not bring them back.
  final Set<String> _dismissed = {};

  bool busy = false; // a request is in flight
  String? error;

  Timer? _pollTimer;
  Timer? _offerTicker;
  StreamSubscription<Position>? _gps;

  bool get onTrip => trips.isNotEmpty;
  OrderOffer? get currentOffer => offers.isEmpty ? null : offers.first;

  Json? get focused {
    for (final t in trips) {
      if (OrderX.id(t) == focusedId) return t;
    }
    return trips.isEmpty ? null : trips.first;
  }

  /// The other orders, shown as "Next deliveries".
  List<Json> get queued => trips.where((t) => OrderX.id(t) != OrderX.id(focused ?? {})).toList();

  // ---------------------------------------------------------------- lifecycle

  Future<void> start() async {
    _socket.on('new_order', _onOffer);
    _socket.on('new_order_available', _onOffer);
    _socket.on('order_claimed', (d) => _dropOffer(_idOf(d)));
    _socket.on('order_deassigned', (d) {
      _dropOffer(_idOf(d));
      refresh();
    });
    _socket.on('order_status_update', (_) => refresh());
    _socket.on('order_ready', (_) => refresh());
    _socket.onConnect((_) => refresh()); // also covers reconnects

    // Sockets drop on mobile: poll too, so no offer or trip is ever missed.
    _pollTimer = Timer.periodic(const Duration(seconds: 15), (_) => refresh());
    // Expire offers whose answer window has passed (the server returns them to admin).
    _offerTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      final before = offers.length;
      for (final o in offers.where((o) => o.timeLeft == Duration.zero)) {
        _dismissed.add(o.id);
      }
      offers.removeWhere((o) => o.timeLeft == Duration.zero);
      if (offers.length != before || offers.isNotEmpty) notifyListeners();
    });

    await refresh();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _offerTicker?.cancel();
    _gps?.cancel();
    for (final e in ['new_order', 'new_order_available', 'order_claimed', 'order_deassigned',
      'order_status_update', 'order_ready']) {
      _socket.off(e);
    }
    super.dispose();
  }

  /// Reload trips and pick up any offers the socket missed.
  Future<void> refresh() async {
    try {
      final current = await _api.activeOrders();
      final currentIds = current.map(OrderX.id).toSet();
      final previousIds = trips.map(OrderX.id).toSet();

      for (final t in current) {
        final tid = OrderX.id(t);
        if (!previousIds.contains(tid)) _socket.emit('join-tracking', tid);
      }
      for (final pid in previousIds.difference(currentIds)) {
        _socket.emit('leave-tracking', pid);
      }

      trips = current;
      if (focusedId == null || !currentIds.contains(focusedId)) {
        focusedId = trips.isEmpty ? null : OrderX.id(trips.first);
      }

      // Admin assignments still waiting for this rider (works mid-trip too).
      final avail = await _api.available();
      for (final o in avail) {
        final status = '${(o['dispatch'] as Json?)?['status'] ?? ''}';
        final assignedByAdmin = (o['dispatch'] as Json?)?['assignedBy'] == 'ADMIN';
        if (status == 'assigned' && (!onTrip || assignedByAdmin)) {
          _addOffer({...o, 'orderMongoId': OrderX.id(o), 'assignedByAdmin': assignedByAdmin});
        } else if (status == 'unassigned' && !onTrip) {
          _addOffer({...o, 'orderMongoId': OrderX.id(o)});
        }
      }

      _syncLocationStream();
      error = null;
    } catch (e) {
      error = 'Could not refresh orders';
    }
    notifyListeners();
  }

  // ---------------------------------------------------------------- offers

  void _onOffer(dynamic payload) {
    if (payload is! Map) return;
    final data = Map<String, dynamic>.from(payload);
    // While on a trip only admin-batched orders can be accepted; skip the rest.
    if (onTrip && data['assignedByAdmin'] != true) return;
    _addOffer(data);
    notifyListeners();
  }

  void _addOffer(Json data) {
    final offer = OrderOffer(data);
    if (offer.id.isEmpty || offer.timeLeft == Duration.zero) return;
    if (_dismissed.contains(offer.id)) return;
    if (offers.any((o) => o.id == offer.id)) return;
    if (trips.any((t) => OrderX.id(t) == offer.id)) return; // already accepted
    offers.add(offer);
  }

  void _dropOffer(String id) {
    offers.removeWhere((o) => o.id == id);
    notifyListeners();
  }

  String _idOf(dynamic d) =>
      d is Map ? '${d['orderMongoId'] ?? d['orderId'] ?? d['_id'] ?? ''}' : '$d';

  Future<void> acceptOffer(OrderOffer offer) => _run(() async {
        await _api.accept(offer.id);
        offers.removeWhere((o) => o.id == offer.id);
        final wasIdle = !onTrip;
        await refresh();
        // First order becomes the focus; a batched one waits in "Next deliveries".
        if (wasIdle) focusedId = offer.id;
      });

  Future<void> rejectOffer(OrderOffer offer) => _run(() async {
        await _api.reject(offer.id);
        _dismissed.add(offer.id);
        offers.removeWhere((o) => o.id == offer.id);
      });

  // ---------------------------------------------------------------- trip steps

  void focus(String orderId) {
    focusedId = orderId;
    notifyListeners();
  }

  Future<void> reachedPickup(Json o) => _step(() => _api.reachedPickup(OrderX.id(o)));
  Future<void> confirmPickup(Json o, {String? billImageUrl}) =>
      _step(() => _api.confirmPickup(OrderX.id(o), billImageUrl: billImageUrl));
  Future<void> reachedDrop(Json o) => _step(() => _api.reachedDrop(OrderX.id(o)));

  /// Finish one order. No handover code needed while dropOtp.required is false (SOHR).
  /// For cash orders, collect payment first (guide section 8), then call this.
  Future<void> completeDelivery(Json o, {String? otp}) => _step(() async {
        final id = OrderX.id(o);
        if (OrderX.dropOtpRequired(o)) {
          await _api.verifyDropOtp(id, otp ?? '');
        }
        await _api.complete(id);
        if (focusedId == id) focusedId = null; // refresh() moves focus to the next order
      });

  Future<void> _step(Future<void> Function() call) => _run(() async {
        await call();
        await refresh();
      });

  Future<void> _run(Future<void> Function() body) async {
    if (busy) return;
    busy = true;
    error = null;
    notifyListeners();
    try {
      await body();
    } catch (e) {
      error = _messageOf(e);
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  String _messageOf(Object e) {
    try {
      final data = (e as dynamic).response?.data;
      if (data is Map && data['message'] != null) return '${data['message']}';
    } catch (_) {}
    return 'Something went wrong. Please try again.';
  }

  // ---------------------------------------------------------------- live location

  /// While any order is picked up, stream GPS every few seconds for EACH such order,
  /// so every customer sees the rider moving.
  void _syncLocationStream() {
    final needsGps = trips.any(OrderX.isPickedUp);
    if (needsGps && _gps == null) {
      _gps = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 10,
        ),
      ).listen(_sendLocation);
    } else if (!needsGps && _gps != null) {
      _gps?.cancel();
      _gps = null;
    }
  }

  DateTime _lastSent = DateTime.fromMillisecondsSinceEpoch(0);

  void _sendLocation(Position p) {
    // The server keeps at most one update per 2 s per order.
    if (DateTime.now().difference(_lastSent) < const Duration(seconds: 3)) return;
    _lastSent = DateTime.now();
    for (final t in trips.where(OrderX.isPickedUp)) {
      _socket.emit('update-location', {
        'orderId': OrderX.id(t),
        'lat': p.latitude,
        'lng': p.longitude,
        'heading': p.heading,
        'speed': p.speed,
        'accuracy': p.accuracy,
      });
    }
  }
}
```

### 3. `trips_screen.dart`: the screen

```dart
// SOHR rider app: home screen for one or more simultaneous deliveries.
//
// Layout:
//   - focused order card with the one button for its current step
//   - "Next deliveries" list (tap to switch focus)
//   - incoming offer sheet on top, with a countdown (works mid-trip for admin orders)
//
// Plug your map widget in where marked; centre it on the focused order.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'active_trips_controller.dart';
import 'trip_api.dart';

class TripsScreen extends StatelessWidget {
  const TripsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.watch<ActiveTripsController>();
    final focused = c.focused;

    return Scaffold(
      appBar: AppBar(
        title: Text(c.trips.length > 1 ? '${c.trips.length} active deliveries' : 'SOHR Rider'),
      ),
      body: Stack(
        children: [
          RefreshIndicator(
            onRefresh: c.refresh,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (c.error != null) _ErrorBanner(c.error!),
                if (focused == null)
                  const _Idle()
                else ...[
                  // TODO: your map here, centred on `focused`.
                  _FocusedOrderCard(order: focused),
                  if (c.queued.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    Text('Next deliveries', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    for (final o in c.queued) _QueuedOrderTile(order: o),
                  ],
                ],
              ],
            ),
          ),
          if (c.currentOffer != null) _OfferSheet(offer: c.currentOffer!),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- focused order

class _FocusedOrderCard extends StatelessWidget {
  const _FocusedOrderCard({required this.order});
  final Json order;

  @override
  Widget build(BuildContext context) {
    final c = context.read<ActiveTripsController>();
    final busy = context.select<ActiveTripsController, bool>((c) => c.busy);
    final phase = OrderX.phase(order);

    final (String label, Future<void> Function() action) = switch (phase) {
      'en_route_to_pickup' => ('Reached restaurant', () => c.reachedPickup(order)),
      'at_pickup' => ('Picked up order', () => c.confirmPickup(order)),
      'en_route_to_delivery' => ('Reached customer', () => c.reachedDrop(order)),
      _ => ('Mark as delivered', () => _finish(context, order)),
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Order ${OrderX.displayId(order)}',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(_phaseText(phase)),
            const Divider(height: 24),
            _Line(Icons.storefront, OrderX.restaurantName(order)),
            _Line(Icons.person, OrderX.customerName(order)),
            _Line(Icons.location_on, OrderX.dropAddress(order)),
            if ('${order['deliveryInstructions'] ?? ''}'.isNotEmpty)
              _Line(Icons.info_outline, '${order['deliveryInstructions']}'),
            if (OrderX.isCashOnDelivery(order))
              _Line(Icons.payments, 'Collect cash: Rs.${order['pricing']?['total'] ?? ''}'),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: busy ? null : action,
                child: busy
                    ? const SizedBox(
                        height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(label),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// At the door. SOHR has no handover code (dropOtp.required == false): collect cash
  /// if needed, then complete. If the code is ever switched back on, ask for it here.
  Future<void> _finish(BuildContext context, Json order) async {
    final c = context.read<ActiveTripsController>();
    if (OrderX.isCashOnDelivery(order)) {
      final collected = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Collect payment'),
          content: Text('Collect Rs.${order['pricing']?['total'] ?? ''} from the customer.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(
                onPressed: () => Navigator.pop(context, true), child: const Text('Cash collected')),
          ],
        ),
      );
      if (collected != true) return;
      // For QR payments use /orders/:id/collect/qr + payment-status (guide section 8).
    }
    String? otp;
    if (OrderX.dropOtpRequired(order)) {
      otp = await _askOtp(context);
      if (otp == null) return;
    }
    await c.completeDelivery(order, otp: otp);
  }

  Future<String?> _askOtp(BuildContext context) {
    final ctl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Customer code'),
        content: TextField(controller: ctl, keyboardType: TextInputType.number, maxLength: 4),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, ctl.text), child: const Text('Verify')),
        ],
      ),
    );
  }

  static String _phaseText(String phase) => switch (phase) {
        'en_route_to_pickup' => 'Go to the restaurant',
        'at_pickup' => 'At the restaurant',
        'en_route_to_delivery' => 'On the way to the customer',
        'at_drop' => 'At the customer',
        _ => phase,
      };
}

// ---------------------------------------------------------------- queued orders

class _QueuedOrderTile extends StatelessWidget {
  const _QueuedOrderTile({required this.order});
  final Json order;

  @override
  Widget build(BuildContext context) {
    final c = context.read<ActiveTripsController>();
    return Card(
      child: ListTile(
        leading: Icon(OrderX.isPickedUp(order) ? Icons.delivery_dining : Icons.storefront),
        title: Text('${OrderX.displayId(order)} · ${OrderX.customerName(order)}'),
        subtitle: Text(OrderX.dropAddress(order), maxLines: 1, overflow: TextOverflow.ellipsis),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => c.focus(OrderX.id(order)),
      ),
    );
  }
}

// ---------------------------------------------------------------- incoming offer

class _OfferSheet extends StatelessWidget {
  const _OfferSheet({required this.offer});
  final OrderOffer offer;

  @override
  Widget build(BuildContext context) {
    final c = context.read<ActiveTripsController>();
    final busy = context.select<ActiveTripsController, bool>((c) => c.busy);
    final onTrip = context.select<ActiveTripsController, bool>((c) => c.onTrip);

    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: Material(
        elevation: 12,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Expanded(
                  child: Text(onTrip ? 'Extra order added by admin' : 'New order',
                      style: Theme.of(context).textTheme.titleLarge),
                ),
                Text('${offer.timeLeft.inSeconds}s'),
              ]),
              const SizedBox(height: 8),
              _Line(Icons.storefront, offer.restaurantName),
              _Line(Icons.location_on, offer.dropAddress),
              _Line(Icons.currency_rupee, 'Earning Rs.${offer.earning}'),
              if (onTrip)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text('It will be added to your current deliveries.'),
                ),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy ? null : () => c.rejectOffer(offer),
                    child: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: busy ? null : () => c.acceptOffer(offer),
                    child: const Text('Accept'),
                  ),
                ),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- small bits

class _Line extends StatelessWidget {
  const _Line(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    if (text.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        Icon(icon, size: 18),
        const SizedBox(width: 8),
        Expanded(child: Text(text)),
      ]),
    );
  }
}

class _Idle extends StatelessWidget {
  const _Idle();
  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.symmetric(vertical: 80),
        child: Center(child: Text('Waiting for orders…')),
      );
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner(this.message);
  final String message;
  @override
  Widget build(BuildContext context) => Card(
        color: Theme.of(context).colorScheme.errorContainer,
        child: Padding(padding: const EdgeInsets.all(12), child: Text(message)),
      );
}
```
