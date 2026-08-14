import { useEffect, useState } from "react"
import { Loader2, MessageSquare, Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Textarea } from "@food/components/ui/textarea"

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
  latitude: "",
  longitude: "",
  items: "",
  amount: "",
  paymentMethod: "cash",
  riderEarning: "",
  deliveryInstructions: "",
}

function Field({ label, children, hint, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </label>
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
  const [error, setError] = useState("")

  useEffect(() => {
    if (isOpen) {
      setForm(emptyForm)
      setError("")
    }
  }, [isOpen])

  const setField = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const handleSubmit = () => {
    if (!form.restaurantId) return setError("Pick the restaurant the rider collects from")
    if (!form.customerName.trim()) return setError("Customer name is required")
    if (!form.customerPhone.trim()) return setError("Customer phone is required")
    if (!form.street.trim()) return setError("Delivery address is required")
    if (!form.city.trim()) return setError("City is required")
    if (!form.state.trim()) return setError("State is required")
    if (!form.items.trim()) return setError("Describe what the customer ordered")
    if (!form.amount || Number(form.amount) < 0) return setError("Order amount is required")

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
        ...(form.latitude ? { latitude: form.latitude } : {}),
        ...(form.longitude ? { longitude: form.longitude } : {}),
      },
      items: form.items.trim(),
      amount: Number(form.amount),
      paymentMethod: form.paymentMethod,
      ...(form.riderEarning === "" ? {} : { riderEarning: Number(form.riderEarning) }),
      deliveryInstructions: form.deliveryInstructions.trim(),
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            New WhatsApp order
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Type in the order you received on WhatsApp. It lands in this table
            unassigned — assign a delivery partner from the row when you are ready.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2 sm:grid-cols-2">
          <Field label="Pickup restaurant" className="sm:col-span-2">
            <select
              value={form.restaurantId}
              onChange={setField("restaurantId")}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-neutral-900"
            >
              <option value="">Select a restaurant…</option>
              {restaurantOptions.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Customer name">
            <Input value={form.customerName} onChange={setField("customerName")} />
          </Field>
          <Field label="Customer phone" hint="Used to identify the customer and to call them">
            <Input value={form.customerPhone} onChange={setField("customerPhone")} />
          </Field>

          <Field label="Delivery address" className="sm:col-span-2">
            <Input value={form.street} onChange={setField("street")} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={setField("city")} />
          </Field>
          <Field label="State">
            <Input value={form.state} onChange={setField("state")} />
          </Field>
          <Field label="Pin code">
            <Input value={form.zipCode} onChange={setField("zipCode")} />
          </Field>
          {/* Optional, but it is what gives the rider the map pin, the trip distance
              and the distance-based payout. Without it the order still works. */}
          <Field label="Latitude" hint="Optional — enables map + distance">
            <Input value={form.latitude} onChange={setField("latitude")} />
          </Field>
          <Field label="Longitude" hint="Optional">
            <Input value={form.longitude} onChange={setField("longitude")} />
          </Field>

          <Field label="Order items" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={form.items}
              onChange={setField("items")}
              placeholder="2x Chicken Biryani, 1x Coke"
            />
          </Field>
          <Field label="Order amount (₹)">
            <Input type="number" min="0" value={form.amount} onChange={setField("amount")} />
          </Field>
          <Field label="Payment">
            <select
              value={form.paymentMethod}
              onChange={setField("paymentMethod")}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-neutral-900"
            >
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
            />
          </Field>
          <Field label="Instructions for the rider">
            <Input
              value={form.deliveryInstructions}
              onChange={setField("deliveryInstructions")}
              placeholder="Landmark, gate number…"
            />
          </Field>
        </div>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
