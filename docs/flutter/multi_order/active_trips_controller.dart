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
