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
