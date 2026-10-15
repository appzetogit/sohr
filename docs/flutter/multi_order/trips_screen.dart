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
