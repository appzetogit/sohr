import { useEffect, useMemo, useRef, useState } from "react"
import { Bike, Loader2, MessageSquare, Minus, Plus, Search, Trash2 } from "lucide-react"
import { adminAPI } from "@food/api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash on delivery" },
  { value: "razorpay_qr", label: "QR / UPI on delivery" },
  { value: "razorpay", label: "Already paid online" },
  { value: "wallet", label: "Wallet" },
]

const emptyForm = {
  restaurantId: "",
  customerName: "",
  customerPhone: "",
  street: "",
  city: "",
  state: "",
  zipCode: "",
  amount: "",
  paymentMethod: "cash",
  riderEarning: "",
  deliveryInstructions: "",
}

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"

function Field({ label, children, hint, className = "" }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </label>
  )
}

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}

const flattenMenu = (payload) => {
  const sections = payload?.data?.data?.menu?.sections || payload?.data?.menu?.sections || []
  return sections.flatMap((section) =>
    (section.items || []).map((item) => ({
      id: String(item.id || item._id),
      name: item.name,
      price: Number(item.price) || 0,
      category: item.categoryName || section.name,
      isAvailable: item.isAvailable !== false,
    })),
  )
}

/** Type-ahead over the restaurant's menu; picked items go into a quantity list. */
function OrderItemsPicker({ menu, menuLoading, cart, setCart }) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef(null)

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const words = q.split(/\s+/)
    return menu
      .filter((item) => words.every((w) => item.name.toLowerCase().includes(w)))
      .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q))
      .slice(0, 8)
  }, [menu, query])

  useEffect(() => setHighlight(0), [query])

  const addItem = (item) => {
    setCart((prev) => {
      const existing = prev.find((line) => line.key === item.key)
      if (existing) {
        return prev.map((line) => (line.key === item.key ? { ...line, qty: line.qty + 1 } : line))
      }
      return [...prev, { ...item, qty: 1 }]
    })
    setQuery("")
    setOpen(false)
    inputRef.current?.focus()
  }

  const addTyped = () => {
    const name = query.trim()
    if (!name) return
    const match = suggestions[highlight]
    if (match) return addItem({ key: match.id, name: match.name, price: match.price })
    addItem({ key: `custom:${name.toLowerCase()}`, name, price: null })
  }

  const changeQty = (key, delta) =>
    setCart((prev) =>
      prev
        .map((line) => (line.key === key ? { ...line, qty: line.qty + delta } : line))
        .filter((line) => line.qty > 0),
    )

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, Math.max(suggestions.length - 1, 0)))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      addTyped()
    } else if (event.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={menuLoading ? "Loading menu…" : "Search the menu, e.g. paneer tikka"}
          className="h-10 pl-9"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-autocomplete="list"
        />

        {open && query.trim() && (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {suggestions.map((item, index) => (
              <li
                key={item.id}
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(e) => {
                  e.preventDefault()
                  addItem({ key: item.id, name: item.name, price: item.price })
                }}
                onMouseEnter={() => setHighlight(index)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                  index === highlight ? "bg-emerald-50" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{item.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {item.category}
                    {!item.isAvailable && " · currently unavailable"}
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-slate-700">₹{item.price}</span>
              </li>
            ))}
            <li
              onMouseDown={(e) => {
                e.preventDefault()
                addItem({ key: `custom:${query.trim().toLowerCase()}`, name: query.trim(), price: null })
              }}
              className="cursor-pointer border-t border-slate-100 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50"
            >
              Add "<span className="font-semibold text-slate-700">{query.trim()}</span>" as a custom item
            </li>
          </ul>
        )}
      </div>

      {cart.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {cart.map((line) => (
            <li key={line.key} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{line.name}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => changeQty(line.key, -1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label={`Remove one ${line.name}`}
                >
                  {line.qty === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                </button>
                <span className="w-6 text-center font-semibold tabular-nums">{line.qty}</span>
                <button
                  type="button"
                  onClick={() => changeQty(line.key, 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label={`Add one ${line.name}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="w-16 text-right tabular-nums text-slate-700">
                {line.price == null ? "—" : `₹${line.price * line.qty}`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
          No items yet. Search the menu above and press Enter or click a suggestion.
        </p>
      )}
    </div>
  )
}

/** Optional rider choice. Riders already holding orders can still be picked (batching). */
function RiderPicker({ partners, loading, selectedId, onSelect }) {
  const [search, setSearch] = useState("")

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return partners
      .filter((p) =>
        !term ||
        [p.name, p.phone, p.zone].some((v) => String(v || "").toLowerCase().includes(term)),
      )
      .sort((a, b) => Number(Boolean(b.isOnline)) - Number(Boolean(a.isOnline)))
  }, [partners, search])

  const option = (id, content) => {
    const selected = selectedId === id
    return (
      <label
        key={id || "none"}
        className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors ${
          selected ? "bg-emerald-50" : "hover:bg-slate-50"
        }`}
      >
        <input
          type="radio"
          name="manual-order-rider"
          checked={selected}
          onChange={() => onSelect(id)}
          className="h-4 w-4 accent-emerald-600"
        />
        {content}
      </label>
    )
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search riders by name or phone"
          className="h-10 pl-9"
        />
      </div>
      <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {option(
          "",
          <span className="text-sm text-slate-700">
            <span className="font-semibold">Assign later</span>
            <span className="block text-xs text-slate-500">The order waits unassigned in the table</span>
          </span>,
        )}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading riders…
          </div>
        ) : visible.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">No approved delivery partners found.</div>
        ) : (
          visible.map((p) => {
            const id = String(p._id || p.id)
            const busy = Number(p.activeOrderCount) || 0
            return option(
              id,
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-slate-800">{p.name || "Unnamed rider"}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      p.isOnline ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {p.isOnline ? "Online" : "Offline"}
                  </span>
                  {busy > 0 && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-700">
                      On {busy} order{busy === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {[p.phone, p.vehicleType, p.zone].filter(Boolean).join(" · ")}
                </span>
              </span>,
            )
          })
        )}
      </div>
    </div>
  )
}

export default function ManualOrderModal({
  isOpen,
  onOpenChange,
  restaurantOptions = [],
  onCreate,
  isSubmitting = false,
}) {
  const [form, setForm] = useState(emptyForm)
  const [cart, setCart] = useState([])
  const [menu, setMenu] = useState([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [amountTouched, setAmountTouched] = useState(false)
  const [partners, setPartners] = useState([])
  const [partnersLoading, setPartnersLoading] = useState(false)
  const [deliveryPartnerId, setDeliveryPartnerId] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!isOpen) return
    // With a single restaurant there is nothing to choose, so preselect it.
    setForm({
      ...emptyForm,
      restaurantId: restaurantOptions.length === 1 ? String(restaurantOptions[0].id) : "",
    })
    setCart([])
    setAmountTouched(false)
    setDeliveryPartnerId("")
    setError("")
  }, [isOpen, restaurantOptions])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setPartnersLoading(true)
    adminAPI
      .getDeliveryPartners({ limit: 1000, page: 1 })
      .then((res) => {
        const rows = res?.data?.data?.deliveryPartners || res?.data?.deliveryPartners || []
        if (!cancelled) setPartners(Array.isArray(rows) ? rows : [])
      })
      .catch(() => !cancelled && setPartners([]))
      .finally(() => !cancelled && setPartnersLoading(false))
    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !form.restaurantId) {
      setMenu([])
      return
    }
    let cancelled = false
    setMenuLoading(true)
    adminAPI
      .getRestaurantMenuById(form.restaurantId)
      .then((res) => !cancelled && setMenu(flattenMenu(res)))
      .catch(() => !cancelled && setMenu([]))
      .finally(() => !cancelled && setMenuLoading(false))
    return () => {
      cancelled = true
    }
  }, [isOpen, form.restaurantId])

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + (line.price || 0) * line.qty, 0),
    [cart],
  )

  // Keep the amount in sync with the picked items until the admin edits it by hand.
  useEffect(() => {
    if (!amountTouched) setForm((prev) => ({ ...prev, amount: cart.length ? String(cartTotal) : "" }))
  }, [cartTotal, cart.length, amountTouched])

  const setField = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const handleSubmit = () => {
    if (!form.restaurantId) return setError("Pick the restaurant the rider collects from")
    if (!form.customerName.trim()) return setError("Customer name is required")
    if (!form.customerPhone.trim()) return setError("Customer phone is required")
    if (!form.street.trim()) return setError("Delivery address is required")
    if (!form.city.trim()) return setError("City is required")
    if (!form.state.trim()) return setError("State is required")
    if (!cart.length) return setError("Add at least one item to the order")
    if (form.amount === "" || Number(form.amount) < 0) return setError("Order amount is required")

    setError("")
    onCreate({
      restaurantId: form.restaurantId,
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim(),
      address: {
        street: form.street.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zipCode: form.zipCode.trim(),
      },
      items: cart.map((line) => `${line.qty}x ${line.name}`).join(", "),
      amount: Number(form.amount),
      paymentMethod: form.paymentMethod,
      ...(form.riderEarning === "" ? {} : { riderEarning: Number(form.riderEarning) }),
      deliveryInstructions: form.deliveryInstructions.trim(),
      ...(deliveryPartnerId ? { deliveryPartnerId } : {}),
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 space-y-1.5 border-b border-slate-200 px-6 pb-4 pt-6 pr-14 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <MessageSquare className="h-5 w-5 text-emerald-600" />
            New WhatsApp order
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            Enter the order you received on WhatsApp. It appears in the table unassigned, and you
            can assign a delivery partner from its row.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {restaurantOptions.length !== 1 && (
            <Section title="Restaurant">
              <Field label="Pickup restaurant" className="sm:col-span-2">
                <select value={form.restaurantId} onChange={setField("restaurantId")} className={SELECT_CLASS}>
                  <option value="">Select a restaurant…</option>
                  {restaurantOptions.map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.id}>
                      {restaurant.name}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>
          )}

          <Section title="Customer">
            <Field label="Name">
              <Input value={form.customerName} onChange={setField("customerName")} className="h-10" />
            </Field>
            <Field label="Phone" hint="Used to identify the customer and to call them">
              <Input
                type="tel"
                inputMode="tel"
                value={form.customerPhone}
                onChange={setField("customerPhone")}
                className="h-10"
              />
            </Field>
          </Section>

          <Section title="Delivery address">
            <Field label="Address" className="sm:col-span-2">
              <Input
                value={form.street}
                onChange={setField("street")}
                placeholder="House no., street, area"
                className="h-10"
              />
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={setField("city")} className="h-10" />
            </Field>
            <Field label="State">
              <Input value={form.state} onChange={setField("state")} className="h-10" />
            </Field>
            <Field label="Pin code">
              <Input inputMode="numeric" value={form.zipCode} onChange={setField("zipCode")} className="h-10" />
            </Field>
            <Field label="Instructions for the rider">
              <Input
                value={form.deliveryInstructions}
                onChange={setField("deliveryInstructions")}
                placeholder="Landmark, gate number…"
                className="h-10"
              />
            </Field>
          </Section>

          <Section title="Order items">
            {form.restaurantId ? (
              <OrderItemsPicker menu={menu} menuLoading={menuLoading} cart={cart} setCart={setCart} />
            ) : (
              <p className="text-sm text-slate-500 sm:col-span-2">Select a restaurant to search its menu.</p>
            )}
          </Section>

          <Section title="Delivery partner">
            <RiderPicker
              partners={partners}
              loading={partnersLoading}
              selectedId={deliveryPartnerId}
              onSelect={setDeliveryPartnerId}
            />
          </Section>

          <Section title="Payment">
            <Field
              label="Order amount (₹)"
              hint={amountTouched ? "Edited by hand" : "Calculated from the items, edit if needed"}
            >
              <Input
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) => {
                  setAmountTouched(true)
                  setField("amount")(e)
                }}
                className="h-10"
              />
            </Field>
            <Field label="Payment method">
              <select value={form.paymentMethod} onChange={setField("paymentMethod")} className={SELECT_CLASS}>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rider payout (₹)" hint="Leave blank to use the fee settings">
              <Input
                type="number"
                min="0"
                value={form.riderEarning}
                onChange={setField("riderEarning")}
                placeholder="Auto"
                className="h-10"
              />
            </Field>
          </Section>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-6 py-4">
          {error && <p className="mb-3 text-sm font-medium text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {deliveryPartnerId ? "Create & send to rider" : "Create order"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
