import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Which bucket a rider falls in, for marketing:
 * - active:   approved and delivered at least once in the last 7 days
 * - inactive: approved, has delivered before, but not in the last 7 days
 * - never:    approved but has never completed a delivery
 * - pending:  registered, waiting for admin approval
 * - blocked:  rejected or deactivated
 */
function segmentFor(rider, stats) {
    if (rider.status === 'pending') return 'pending';
    if (rider.status !== 'approved') return 'blocked';
    if (stats.deliveries7d > 0) return 'active';
    if (stats.lifetime > 0 || Number(rider.totalDeliveries) > 0) return 'inactive';
    return 'never';
}

/**
 * Registered / active / inactive riders, optionally for one city (e.g. Prayagraj).
 * Activity comes from delivered orders, not the rider's own counter, so it can't drift.
 */
export async function getRiderReport(query = {}) {
    const city = String(query.city || '').trim();
    const filter = city ? { city: { $regex: `^\\s*${escapeRegex(city)}\\s*$`, $options: 'i' } } : {};

    const riders = await FoodDeliveryPartner.find(filter)
        .select('name phone city state status availabilityStatus lastLocationAt createdAt approvedAt totalDeliveries vehicleType')
        .sort({ createdAt: -1 })
        .lean();

    const now = Date.now();
    const since7 = new Date(now - 7 * DAY_MS);
    const since30 = new Date(now - 30 * DAY_MS);
    const riderIds = riders.map((r) => r._id);

    const deliveryStats = riderIds.length
        ? await FoodOrder.aggregate([
              {
                  $match: {
                      'dispatch.deliveryPartnerId': { $in: riderIds },
                      orderStatus: 'delivered',
                  },
              },
              {
                  $project: {
                      partnerId: '$dispatch.deliveryPartnerId',
                      deliveredAt: { $ifNull: ['$deliveryState.deliveredAt', '$updatedAt'] },
                  },
              },
              {
                  $group: {
                      _id: '$partnerId',
                      lifetime: { $sum: 1 },
                      deliveries7d: { $sum: { $cond: [{ $gte: ['$deliveredAt', since7] }, 1, 0] } },
                      deliveries30d: { $sum: { $cond: [{ $gte: ['$deliveredAt', since30] }, 1, 0] } },
                      lastDeliveredAt: { $max: '$deliveredAt' },
                  },
              },
          ])
        : [];
    const statsById = new Map(deliveryStats.map((s) => [String(s._id), s]));

    const summary = {
        totalRegistered: riders.length,
        approved: 0,
        pendingApproval: 0,
        blocked: 0,
        onlineNow: 0,
        active7d: 0,
        inactive: 0,
        neverDelivered: 0,
        joinedLast7d: 0,
    };
    const byCity = {};

    const rows = riders.map((rider) => {
        const s = statsById.get(String(rider._id)) || {
            lifetime: 0,
            deliveries7d: 0,
            deliveries30d: 0,
            lastDeliveredAt: null,
        };
        const segment = segmentFor(rider, s);
        const online = rider.status === 'approved' && rider.availabilityStatus === 'online';

        if (rider.status === 'approved') summary.approved += 1;
        if (segment === 'pending') summary.pendingApproval += 1;
        if (segment === 'blocked') summary.blocked += 1;
        if (segment === 'active') summary.active7d += 1;
        if (segment === 'inactive') summary.inactive += 1;
        if (segment === 'never') summary.neverDelivered += 1;
        if (online) summary.onlineNow += 1;
        if (rider.createdAt && new Date(rider.createdAt).getTime() >= since7.getTime()) summary.joinedLast7d += 1;

        const cityKey = String(rider.city || '').trim() || 'Unknown';
        byCity[cityKey] = (byCity[cityKey] || 0) + 1;

        return {
            id: String(rider._id),
            name: rider.name || '',
            phone: rider.phone || '',
            city: rider.city || '',
            vehicleType: rider.vehicleType || '',
            status: rider.status,
            segment,
            online,
            registeredAt: rider.createdAt || null,
            lastSeenAt: rider.lastLocationAt || null,
            lastDeliveredAt: s.lastDeliveredAt || null,
            deliveries7d: s.deliveries7d,
            deliveries30d: s.deliveries30d,
            totalDeliveries: Math.max(s.lifetime, Number(rider.totalDeliveries) || 0),
        };
    });

    return {
        city: city || null,
        generatedAt: new Date(now),
        summary,
        byCity: Object.entries(byCity)
            .map(([name, count]) => ({ city: name, count }))
            .sort((a, b) => b.count - a.count),
        riders: rows,
    };
}
