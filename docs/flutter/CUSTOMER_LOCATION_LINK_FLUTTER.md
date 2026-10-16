# SOHR Rider App: Customer Location Link (Flutter)

For WhatsApp orders, the admin can paste the Google Maps location the customer shared. The rider app must show a button that opens it in Google Maps.

Base URL: `https://sohr.in/api/v1`

---

## What the server sends

Every rider-facing order has a top-level string:

```json
"customerLocationLink": "https://maps.app.goo.gl/AbC123xyz"
```

- It is `""` when the admin didn't add a link. Hide the button then, or fall back to an address search.
- Only Google Maps links are ever stored (`maps.app.goo.gl`, `goo.gl/maps`, `google.com/maps`, `maps.google.com`, `google.co.in/maps`); the server refuses anything else.
- When the link contains coordinates, the server also saves them as the drop pin: `deliveryAddress.location.coordinates = [lng, lat]`. So the map marker, trip distance and payout work as normal.

### Where it appears

| Source | Field |
|---|---|
| `GET /food/delivery/orders/current` | `activeOrders[].customerLocationLink` (and `activeOrder.customerLocationLink`) |
| `GET /food/delivery/orders/available` | `docs[].customerLocationLink` |
| `GET /food/delivery/orders/:orderId` | `order.customerLocationLink` |
| Socket `new_order` / `new_order_available` | `customerLocationLink` |
| FCM data push (new order) | `data.customerLocationLink` (string) |

The raw value is also at `deliveryAddress.locationLink`; use `customerLocationLink`.

---

## Package

```yaml
dependencies:
  url_launcher: ^6.3.1
```

**Android:** to open links in the Maps app on Android 11+, add this to `android/app/src/main/AndroidManifest.xml`, inside `<manifest>`:

```xml
<queries>
  <intent>
    <action android:name="android.intent.action.VIEW" />
    <data android:scheme="https" />
  </intent>
</queries>
```

**iOS:** nothing is needed for `https` links.

---

## Code

```dart
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

typedef Json = Map<String, dynamic>;

/// The Google Maps link the customer shared, or '' when there is none.
String customerLocationLink(Json order) {
  final link = '${order['customerLocationLink'] ?? order['deliveryAddress']?['locationLink'] ?? ''}'.trim();
  return link.startsWith('http://') || link.startsWith('https://') ? link : '';
}

String customerAddressText(Json order) {
  final a = (order['deliveryAddress'] as Json?) ?? {};
  return [a['street'], a['city'], a['state']]
      .where((v) => v != null && '$v'.trim().isNotEmpty)
      .join(', ');
}

/// Opens the shared location in the Google Maps app (or the browser).
/// Without a link, falls back to searching the delivery address.
Future<void> openCustomerLocation(BuildContext context, Json order) async {
  final link = customerLocationLink(order);
  final address = customerAddressText(order);

  final Uri? uri = link.isNotEmpty
      ? Uri.tryParse(link)
      : address.isNotEmpty
          ? Uri.https('www.google.com', '/maps/search/', {'api': '1', 'query': address})
          : null;

  if (uri == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('No location for this customer')),
    );
    return;
  }

  final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!opened && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Could not open Google Maps')),
    );
  }
}

/// Drop this on the delivery screen (and optionally on the new-order card).
class CustomerLocationButton extends StatelessWidget {
  const CustomerLocationButton({super.key, required this.order});
  final Json order;

  @override
  Widget build(BuildContext context) {
    final hasLink = customerLocationLink(order).isNotEmpty;
    final hasAddress = customerAddressText(order).isNotEmpty;
    if (!hasLink && !hasAddress) return const SizedBox.shrink();

    return SizedBox(
      width: double.infinity,
      child: FilledButton.icon(
        onPressed: () => openCustomerLocation(context, order),
        icon: const Icon(Icons.navigation),
        label: Text(hasLink ? "Open customer's shared location" : 'Navigate to address'),
      ),
    );
  }
}
```

### Where to put it

| Screen | What to show |
|---|---|
| New-order offer card | Small "View location" link, using `customerLocationLink` from the socket or push data |
| Trip, heading to the customer (`en_route_to_delivery`) | `CustomerLocationButton` under the customer's name and address |
| At the customer (`at_drop`) | Keep the button visible, so the rider can re-check the exact gate or house |

When the order has a pin (`deliveryAddress.location.coordinates`), keep using it for your in-app map marker and route. The link is for opening Google Maps itself.

---

## Test

1. In the admin panel (**Orders → New WhatsApp order**), fill in the order and paste a Google Maps link in **Customer location link**, for example a location shared from WhatsApp. Send it to your test rider.
2. On the offer card, "View location" should open Google Maps at that spot.
3. After accepting and picking up, the **"Open customer's shared location"** button should open the same spot.
4. Create an order **without** a link. The button should say **"Navigate to address"** and search the typed address.
