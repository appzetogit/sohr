# SOHR rider app: multiple orders at once

Drop-in Flutter code for riders carrying several orders. An admin can assign extra orders to a rider who is already on a delivery (for example several WhatsApp orders going the same way).

| File | What it does |
|---|---|
| `trip_api.dart` | All delivery API calls plus `OrderX` helpers for reading order maps |
| `active_trips_controller.dart` | State: every active order, which one is in focus, the incoming-offer queue, socket events, polling, and live location for every picked-up order |
| `trips_screen.dart` | Screen: focused order with its next-step button, a "Next deliveries" list and an offer sheet with a countdown |

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
