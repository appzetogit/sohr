/**
 * Resolve a human-readable customer delivery address from order payload shapes
 * (socket offer, accept response, current-trip sync).
 */
export function resolveCustomerAddress(order) {
  if (!order) return '';

  const saved =
    order.customerAddress ||
    order.customer_address ||
    order.deliveryAddress?.formattedAddress ||
    order.deliveryAddress?.address ||
    '';

  if (String(saved).trim()) return String(saved).trim();

  const deliveryAddress = order.deliveryAddress || {};
  const addressParts = [
    deliveryAddress.street,
    deliveryAddress.additionalDetails,
    deliveryAddress.city,
    deliveryAddress.state,
    deliveryAddress.zipCode,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  return addressParts.length ? addressParts.join(', ') : '';
}

/** Open Google Maps with a searchable address (same pattern as restaurant pickup). */
export function openGoogleMapsForAddress(address) {
  const query = String(address || '').trim();
  if (!query) return false;
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    '_blank',
  );
  return true;
}

/**
 * Google Maps link the customer shared (WhatsApp orders), validated by the server.
 * Empty string when there is none.
 */
export function resolveCustomerLocationLink(order) {
  const link = String(order?.customerLocationLink || order?.deliveryAddress?.locationLink || '').trim();
  return /^https?:\/\//i.test(link) ? link : '';
}

/** Open the customer's shared location if there is one, otherwise search their address. */
export function openCustomerLocation(order) {
  const link = resolveCustomerLocationLink(order);
  if (link) {
    window.open(link, '_blank', 'noopener,noreferrer');
    return;
  }
  const address = resolveCustomerAddress(order);
  if (address) openGoogleMapsForAddress(address);
}
