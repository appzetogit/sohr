# SOHR Delivery App: Flutter Implementation Guide

This guide covers how to wire the Flutter delivery-partner app to the live SOHR backend. It gives you the production URLs, auth and token refresh, realtime, location, the trip flow and the things that will trip you up.

For the complete request and response payloads of every endpoint, see [DELIVERY_API_SPEC.md](DELIVERY_API_SPEC.md). This guide doesn't repeat them.

---

## 1. Environment

| What | Value |
|---|---|
| API base URL | `https://sohr.in/api/v1` |
| Delivery endpoints prefix | `https://sohr.in/api/v1/food/delivery` |
| Auth endpoints prefix | `https://sohr.in/api/v1/food/auth` |
| Socket.IO server | `https://sohr.in`, path `/socket.io/`, websocket transport |
| Uploaded files | `https://sohr.in/uploads/...` (API returns relative paths like `/uploads/food/...`) |
| Service zone (live) | Prayagraj, about a 15 km ring around the city centre |

```dart
// lib/core/env.dart
class Env {
  static const host = 'https://sohr.in';
  static const apiBase = '$host/api/v1';
  static const socketUrl = host;          // path is /socket.io/ (default)

  /// API returns "/uploads/..." paths. Make them absolute before loading images.
  static String fileUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http')) return path;
    return '$host${path.startsWith('/') ? '' : '/'}$path';
  }
}
```

Every response uses the same envelope:

```json
{ "success": true,  "message": "…", "data": { … } }
{ "success": false, "message": "Human readable error" }
```

Show `message` to the user on errors. There is one exception: `GET /food/delivery/check-vehicle/:number` puts `isAvailable` at the top level instead of inside `data`.

---

## 2. Packages

```yaml
dependencies:
  dio: ^5.7.0
  flutter_secure_storage: ^9.2.2
  socket_io_client: ^3.0.2        # Socket.IO v4 protocol, matches the server
  geolocator: ^13.0.1
  google_maps_flutter: ^2.9.0
  flutter_polyline_points: ^2.1.0 # decode the route polyline
  firebase_core: ^3.6.0
  firebase_messaging: ^15.1.3
  image_picker: ^1.1.2            # profile and document photos
  url_launcher: ^6.3.1            # tel: links for restaurant and customer
  razorpay_flutter: ^1.3.7        # only for cash deposit (section 9)
```

---

## 3. HTTP client with token refresh

The access token goes in `Authorization: Bearer <accessToken>`. When it expires the API returns **401**. On 401, call `POST /food/auth/refresh-token` with `{ "refreshToken": "…" }`, store the new tokens, and retry the request once. If the refresh also fails, log the user out.

```dart
// lib/core/api_client.dart
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'env.dart';

class ApiClient {
  ApiClient._() {
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: 'accessToken');
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
      onError: (e, handler) async {
        final isAuthCall = e.requestOptions.path.contains('/food/auth/');
        if (e.response?.statusCode == 401 && !isAuthCall && await _refresh()) {
          final retry = await dio.fetch(e.requestOptions
            ..headers['Authorization'] = 'Bearer ${await _storage.read(key: 'accessToken')}');
          return handler.resolve(retry);
        }
        handler.next(e);
      },
    ));
  }
  static final instance = ApiClient._();

  final _storage = const FlutterSecureStorage();
  final dio = Dio(BaseOptions(
    baseUrl: Env.apiBase,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 30),
  ));

  Future<bool>? _refreshing;
  Future<bool> _refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    final refreshToken = await _storage.read(key: 'refreshToken');
    if (refreshToken == null) return false;
    try {
      final res = await Dio(BaseOptions(baseUrl: Env.apiBase))
          .post('/food/auth/refresh-token', data: {'refreshToken': refreshToken});
      final data = res.data['data'] ?? res.data;
      await saveTokens(data['accessToken'], data['refreshToken'] ?? refreshToken);
      return true;
    } catch (_) {
      await clearTokens();
      return false;
    }
  }

  Future<void> saveTokens(String access, String refresh) async {
    await _storage.write(key: 'accessToken', value: access);
    await _storage.write(key: 'refreshToken', value: refresh);
  }

  Future<void> clearTokens() => _storage.deleteAll();
}
```

Run concurrent 401s through one refresh call, as `_refreshing` does above. Otherwise two refreshes race and the second one invalidates the first.

---

## 4. Login and registration

Login is by phone and OTP. There are no passwords.

1. `POST /food/auth/delivery/request-otp` with `{ "phone": "9876543210" }`.
2. `POST /food/auth/delivery/verify-otp` with `{ "phone", "otp", "fcmToken", "platform": "mobile" }`.
3. Save `accessToken` and `refreshToken`, and keep `user`. That's the partner document.

**New riders** sign up with `POST /food/delivery/register` (multipart, no auth). This needs name, phone, vehicle details, PAN, Aadhaar, driving licence and photos; see spec section 2. Check the vehicle number first with `GET /food/delivery/check-vehicle/:number`.

**Approval gate.** A new partner starts as `status: "pending"`, and an admin must approve them in the admin panel (`https://sohr.in/admin`). Only `approved` partners can go online or see orders. Check `status` on **every app launch** via `GET /food/auth/me`, not just at login, and route as follows:

| `status` | Screen |
|---|---|
| `approved` | Home (online toggle, orders) |
| `pending` | "Under review" screen |
| `rejected` | Show `rejectionReason`, offer to edit and resubmit details |
| `deactivated` | Blocked screen with support contact |

**Testing:** the server currently runs with default OTP on, so **every phone number's OTP is `1234`**. This switches off once real SMS is configured, so don't hardcode it anywhere.

---

## 5. Going online and location

The server offers orders to riders by their **last known GPS**, within 20 km. A rider whose location is stale gets nothing.

- **Toggle online or offline:** `PATCH /food/delivery/availability` with `{ "status": "online", "latitude": 25.45, "longitude": 81.83 }`. Send latitude and longitude as **numbers**; strings are silently ignored.
- **While online with no active trip:** re-send that same call every **30 to 60 seconds** to keep the location fresh.
- **During an active trip:** stream location over the socket (section 6) every **3 to 5 seconds**. The server drops anything faster than one update per 2 seconds per order.

```dart
Future<void> setOnline(bool online) async {
  final pos = await Geolocator.getCurrentPosition();
  await ApiClient.instance.dio.patch('/food/delivery/availability', data: {
    'status': online ? 'online' : 'offline',
    'latitude': pos.latitude,
    'longitude': pos.longitude,
  });
}
```

Ask for **background location** permission (Android `ACCESS_BACKGROUND_LOCATION`, iOS "Always") and run a foreground service while online. Otherwise the OS kills location updates when the app is in the background mid-trip.

Coordinates the server stores and returns are **`[lng, lat]`** (GeoJSON). Flip them before giving them to `LatLng(lat, lng)`.

---

## 6. Realtime (Socket.IO)

```dart
import 'package:socket_io_client/socket_io_client.dart' as io;

io.Socket connectSocket(String accessToken) {
  final socket = io.io(
    Env.socketUrl,
    io.OptionBuilder()
        .setTransports(['websocket'])
        .setAuth({'token': accessToken})
        .enableReconnection()
        .disableAutoConnect()
        .build(),
  );

  socket.onConnect((_) {
    // The server auto-joins delivery:<partnerId> from the token; this is an explicit re-join.
    socket.emit('join-delivery', partnerId);
  });

  socket.on('new_order_available', (data) => showIncomingOrder(data));
  socket.on('order_claimed', (data) => dismissIncomingOrder(data));   // another rider took it
  socket.on('order_deassigned', (data) => handleDeassigned(data));
  socket.on('order_ready', (data) => refreshActiveOrder());           // kitchen marked it ready
  socket.on('order_status_update', (data) => refreshActiveOrder());

  socket.connect();
  return socket;
}
```

**Emits:**

| Event | Payload | When |
|---|---|---|
| `join-delivery` | `partnerId` (string) | after connect or reconnect |
| `join-tracking` | `orderId` | when a trip starts |
| `leave-tracking` | `orderId` | when the trip ends |
| `update-location` | `{ orderId, lat, lng, heading?, speed?, accuracy? }` | every 3 to 5 s during an active trip |

```dart
socket.emit('update-location', {
  'orderId': activeOrder.id,
  'lat': pos.latitude,
  'lng': pos.longitude,
  'heading': pos.heading,
  'speed': pos.speed,
  'accuracy': pos.accuracy,
});
```

**Don't rely on the socket alone.** Mobile sockets drop. Poll `GET /food/delivery/orders/available` every 15 to 20 s while online and idle, and reload the current trip with `GET /food/delivery/orders/current` on app resume and on socket reconnect.

When the access token is refreshed, disconnect and reconnect the socket with the new token. The token is only checked at handshake.

---

## 7. Trip flow

```
 new_order_available ─▶ accept ─▶ reached-pickup ─▶ confirm-pickup ─▶ reached-drop ─▶ verify-drop-otp ─▶ complete
                      └▶ reject
```

All paths below are under `/food/delivery`. `:orderId` accepts the display id (`FOD-…`) or the Mongo `_id`.

| Step | Call | Notes |
|---|---|---|
| Incoming offer | socket `new_order_available` or `GET /orders/available` | Show restaurant, drop area, `riderEarning`, `pickupDistanceKm` |
| Accept | `PATCH /orders/:orderId/accept` | Then `join-tracking` and start streaming location |
| Decline | `PATCH /orders/:orderId/reject` | |
| At restaurant | `PATCH /orders/:orderId/reached-pickup` | |
| Picked up | `PATCH /orders/:orderId/confirm-pickup` | Optional body `{ "billImageUrl": "…" }` |
| At customer | `PATCH /orders/:orderId/reached-drop` | |
| Customer OTP | `POST /orders/:orderId/verify-drop-otp` | **Only if `deliveryVerification.dropOtp.required` is `true`.** Body `{ "otp": "1234" }`; the customer reads it out and it is never in any response to you. **SOHR currently has this switched off** (`required: false`): skip the code screen and call `complete` directly |
| Collect payment (COD) | section 8 | Only if the order isn't prepaid |
| Done | `PATCH /orders/:orderId/complete` | Then `leave-tracking` |

To drive the UI, read `deliveryState.currentPhase`: `en_route_to_pickup` → `at_pickup` → `en_route_to_delivery` → `at_drop` → `delivered` → `completed`.

On launch, `GET /orders/current` returns `{ activeOrder }`. If one exists, go straight back into that trip.

**Map route:** `GET /orders/:orderId/route?lat=&lng=` returns an encoded Google polyline. Decode it with `flutter_polyline_points`. Call it only when a phase starts or when the rider is clearly off route, because every call is a billed Google request. If it returns `polyline: ""`, keep the markers and skip the line; that isn't an error.

**Calling:** orders include `restaurantCallUri` and `customerCallUri` (`tel:…`). Open them with `url_launcher`.

**Notes on an order:** `note` and `deliveryInstructions` are the **customer's delivery instructions**. `cookingNote` is the kitchen note. Don't mix them up.

### Several orders at once (admin batching)

> **Ready-made Flutter code:** [`docs/flutter/multi_order/`](docs/flutter/multi_order/README.md) has the API layer, controller and screen for this.

Automatic dispatch gives a rider one order at a time. An **admin can deliberately assign more orders to a rider who is already on a trip**, for example several WhatsApp orders going the same way. The app has to handle that:

- **The offer still arrives mid-trip.** The socket event `new_order` has `assignedByAdmin: true`. Show it even while a trip is running; ignore other offers while busy. You have 45 seconds to accept, after which the order goes back to the admin.
- **Accepting mid-trip is allowed** for these orders only. `PATCH /orders/:orderId/accept` succeeds for an admin-assigned order; for anything else a busy rider still gets "You already have an active delivery".
- **`GET /orders/current`** returns `activeOrders` (every accepted, unfinished order, most recently updated first) as well as the old single `activeOrder` (= `activeOrders[0]`). Use `activeOrders`.
- **`GET /orders/available`** for a busy rider returns their accepted orders plus admin assignments waiting for them.
- **Suggested UX:** keep one order "in focus" on the map, with the others in a "Next deliveries" list. When one is completed, move focus to the next item in `activeOrders`. Every trip call (`reached-pickup`, `confirm-pickup`, and so on) takes its own `:orderId`, so orders progress independently. Send `update-location` for each order that has been picked up but not delivered.

**Can't finish a trip** (breakdown or accident) **before pickup:** `POST /food/delivery/order-emergency-requests` with `{ "reason": "at least 10 characters" }`.

---

### No handover OTP at the door (current SOHR setting)

SOHR has the customer handover code **switched off**. The rider does not ask the customer for an OTP; they just mark the order delivered. The server says so on every order:

```json
"deliveryVerification": { "dropOtp": { "required": false, "verified": false } }
```

What to change in the app:

1. **Read the flag; don't hard-code it.** Treat a missing value as `true`, so the app keeps working if the code is ever switched back on.
2. **When `required == false`:** don't show the OTP entry screen and don't call `verify-drop-otp`. At the customer, show one **"Mark as delivered"** button.
3. **Cash orders still collect payment first** (section 8), then complete.
4. **Complete** with `PATCH /food/delivery/orders/:orderId/complete` and body `{}`. No `otp` field is needed.
5. Remove any "Ask customer for OTP" text, OTP push or notification handling, and OTP fields in the order details UI.

```dart
bool dropOtpRequired(Map<String, dynamic> order) {
  final dropOtp = order['deliveryVerification']?['dropOtp'];
  return dropOtp?['required'] != false; // missing => required (safe default)
}

Future<void> finishDelivery(Map<String, dynamic> order, {String? otp}) async {
  final id = order['_id'] ?? order['orderMongoId'];
  final dio = ApiClient.instance.dio;

  if (dropOtpRequired(order)) {
    // Only when the code is switched back on.
    await dio.post('/food/delivery/orders/$id/verify-drop-otp', data: {'otp': otp});
  }
  await dio.patch('/food/delivery/orders/$id/complete', data: {});
}

// At the drop screen:
Widget dropActions(Map<String, dynamic> order) {
  if (!dropOtpRequired(order)) {
    return ElevatedButton(
      onPressed: () => collectPaymentIfCodThen(order, () => finishDelivery(order)),
      child: const Text('Mark as delivered'),
    );
  }
  return OtpEntryWidget(onSubmit: (otp) => finishDelivery(order, otp: otp));
}
```

Older app builds that still call `verify-drop-otp` won't break: the server answers 200 and lets them through. Ship the change anyway, so riders aren't shown a code screen they can't complete.

## 8. Cash on delivery

1. Show a QR: `POST /orders/:orderId/collect/qr` returns `{ shortUrl, imageUrl, amount, expiresAt }`. Render `shortUrl` as a QR code.
2. Poll `GET /orders/:orderId/payment-status` every 3 s until `payment.status == "paid"`.
3. Customer pays cash instead: `POST /orders/:orderId/collect/cash`.

QR needs Razorpay keys on the server, which **aren't configured yet**. Until they are, the QR call returns "QR payment not configured", so fall back to the cash button.

---

## 9. Wallet, earnings and the rest

| Screen | Endpoint |
|---|---|
| Wallet and transactions | `GET /food/delivery/wallet` |
| Withdraw | `POST /food/delivery/wallet/withdraw` |
| Deposit collected cash | `POST /food/delivery/wallet/deposit/order` → Razorpay checkout → `POST /food/delivery/wallet/deposit/verify` (**snake_case** keys: `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`) |
| Earnings summary | `GET /food/delivery/earnings?period=today\|week\|month\|all` |
| Trip history | `GET /food/delivery/trip-history?period=daily\|weekly\|monthly` |
| Weekly pocket | `GET /food/delivery/pocket-details` |
| Incentive offers | `GET /food/delivery/earning-addons/active` |
| Cash limit | `GET /food/delivery/cash-limit` |
| Referral | `GET /food/delivery/referrals/stats` (share `referralLink`, or the code if the link is empty) |
| Emergency numbers | `GET /food/delivery/emergency-help` |
| Support tickets | `POST` / `GET /food/delivery/support-tickets` |
| Profile edits | `PATCH /food/delivery/profile/details` (JSON) or `PATCH /food/delivery/profile` (multipart with photos) |
| Bank details | `PATCH /food/delivery/profile/bank-details` |
| Delete account | `DELETE /food/delivery/profile/account` (permanent, so confirm twice in the UI) |
| Notifications inbox | `GET /food/notifications/inbox` |

Don't show `totalHours`, `totalMinutes` or `incentive` from `/earnings`; the server doesn't compute them yet and they're always 0.

---

## 10. Push notifications (FCM)

1. Get the token with `FirebaseMessaging.instance.getToken()`.
2. Send it at login (`fcmToken` + `platform: "mobile"` in verify-otp), and again on token refresh via `POST /fcm-tokens/mobile/save`.
3. On logout, call `DELETE /fcm-tokens/remove`.
4. Show a high-priority notification for new orders, because the rider is often not looking at the app.

The server's Firebase service account **isn't configured yet**, so pushes won't send until it is. Build against the socket and polling first.

---

## 11. Gotchas

1. **Coordinates are `[lng, lat]`** everywhere the server stores them.
2. **Latitude and longitude must be numbers**, not strings, in `/availability`.
3. **Check `status` on every launch.** An admin can deactivate a rider at any time.
4. **Image paths are relative.** Pass them through `Env.fileUrl()`.
5. **Deposit verify uses snake_case** Razorpay keys. Other payment calls in the platform use camelCase.
6. **Check `deliveryVerification.dropOtp.required` on every order** before showing a handover-code screen. It is currently `false` for SOHR, so no code is needed at the door. When it is `true`, the code is never sent to you; only the customer has it.
7. **Reconnect the socket after a token refresh.**
8. **Poll as well as using the socket**, for offers and the active trip.

## 12. Test checklist

- [ ] Register a rider in the app, approve them at `https://sohr.in/admin`, then log in with OTP `1234`.
- [ ] Go online from inside Prayagraj (or a mocked GPS location there). Outside the zone, no orders arrive.
- [ ] Place an order from the customer app for SOHR by Vyas Ji, have the restaurant accept it, and check the offer reaches the rider.
- [ ] Walk the whole trip flow, including cash collection. The handover code is currently off, so `complete` works without it.
- [ ] Kill and reopen the app mid-trip. It should resume the active trip.
- [ ] Turn airplane mode on and off mid-trip. The socket should reconnect and the location stream resume.
