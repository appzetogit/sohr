// Validation for the admin "New WhatsApp order" form.
// Mirrors validateManualOrderDto on the server (Backend/src/modules/food/orders/
// validators/order.validator.js); the server re-checks everything.

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u

/** 10-digit Indian mobile, accepting +91 / 91 / 0 prefixes and spaces or dashes. */
export function normalizeIndianMobile(value) {
  const digits = String(value ?? "").replace(/[\s\-().]/g, "").replace(/^\+/, "")
  const local = digits.replace(/^(?:0{0,2}91|0)(?=[6-9]\d{9}$)/, "")
  return /^[6-9]\d{9}$/.test(local) ? local : null
}

const MAPS_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "maps.google.com",
  "google.com",
  "www.google.com",
  "maps.google.co.in",
  "google.co.in",
  "www.google.co.in",
])

/** Same rule as the server: an http(s) Google Maps link (full or maps.app.goo.gl). */
export function isGoogleMapsLink(value) {
  let url
  try {
    url = new URL(String(value || "").trim())
  } catch {
    return false
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false
  const host = url.hostname.toLowerCase()
  if (!MAPS_HOSTS.has(host)) return false
  if (host === "goo.gl") return url.pathname.startsWith("/maps")
  if (host === "maps.app.goo.gl") return url.pathname.length > 1
  if (host.startsWith("maps.")) return true
  return url.pathname.startsWith("/maps")
}

const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ")

function checkName(value, label, min, max) {
  const v = clean(value)
  if (!v) return `${label} is required`
  if (v.length < min) return `${label} must be at least ${min} characters`
  if (v.length > max) return `${label} must be at most ${max} characters`
  if (!NAME_RE.test(v)) return `${label} can only contain letters, spaces and . ' -`
  return null
}

/**
 * Returns { field: message } for every problem; an empty object means valid.
 * Field keys match the form: restaurantId, customerName, customerPhone, street, city,
 * state, zipCode, deliveryInstructions, items, amount, riderEarning, and
 * `item:<key>` for an individual order line.
 */
export function validateManualOrder(form, cart = []) {
  const errors = {}
  const set = (key, message) => {
    if (message) errors[key] = message
  }

  if (!form.restaurantId) set("restaurantId", "Pick the restaurant the rider collects from")

  set("customerName", checkName(form.customerName, "Customer name", 2, 80))

  if (!clean(form.customerPhone)) set("customerPhone", "Customer phone is required")
  else if (!normalizeIndianMobile(form.customerPhone))
    set("customerPhone", "Enter a valid 10-digit mobile number (starts with 6-9)")

  const street = clean(form.street)
  if (!street) set("street", "Delivery address is required")
  else if (street.length < 5) set("street", "Address must be at least 5 characters")
  else if (street.length > 200) set("street", "Address must be at most 200 characters")

  set("city", checkName(form.city, "City", 2, 60))
  set("state", checkName(form.state, "State", 2, 60))

  const zip = clean(form.zipCode)
  if (zip && !/^[1-9]\d{5}$/.test(zip)) set("zipCode", "Pin code must be 6 digits")

  const link = String(form.locationLink || "").trim()
  if (link && !isGoogleMapsLink(link))
    set("locationLink", "Paste a Google Maps link (maps.app.goo.gl or google.com/maps)")

  if (clean(form.deliveryInstructions).length > 300)
    set("deliveryInstructions", "Instructions must be at most 300 characters")

  if (!cart.length) set("items", "Add at least one item")
  if (cart.length > 50) set("items", "An order can have at most 50 items")
  for (const line of cart) {
    const qty = Number(line.qty)
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) set(`item:${line.key}`, "Quantity must be 1–99")
    else if (line.price === null || line.price === "" || !Number.isFinite(Number(line.price)))
      set(`item:${line.key}`, "Enter a price for this item")
    else if (Number(line.price) < 0) set(`item:${line.key}`, "Price cannot be negative")
  }
  if (Object.keys(errors).some((k) => k.startsWith("item:")) && !errors.items)
    set("items", "Fix the highlighted items")

  const amount = Number(form.amount)
  if (form.amount === "" || form.amount === null || !Number.isFinite(amount)) set("amount", "Order amount is required")
  else if (amount <= 0) set("amount", "Order amount must be more than 0")
  else if (amount > 100000) set("amount", "Order amount is too large")

  if (form.riderEarning !== "" && form.riderEarning !== null && form.riderEarning !== undefined) {
    const payout = Number(form.riderEarning)
    if (!Number.isFinite(payout) || payout < 0) set("riderEarning", "Rider payout cannot be negative")
    else if (payout > 5000) set("riderEarning", "Rider payout is too large")
  }

  return errors
}

/** Order the form fields appear in, so the first error can be scrolled into view. */
export const FIELD_ORDER = [
  "restaurantId",
  "customerName",
  "customerPhone",
  "street",
  "city",
  "state",
  "zipCode",
  "locationLink",
  "deliveryInstructions",
  "items",
  "amount",
  "riderEarning",
]
